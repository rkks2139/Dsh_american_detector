#!/usr/bin/env node
/**
 * Headless smoke test for the built client bundle.
 *
 * Stubs just enough of the browser (document, navigator, timers) and a
 * minimal Cordis-like ctx to materialize the factory, apply the plugin,
 * simulate a send, and assert the fake ban dialog appears and dismisses.
 *
 * Usage: node scripts/test-client.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = readFileSync(join(root, 'lib/client.js'), 'utf8')

/* ------------------------------ DOM stub ------------------------------ */
class ClassList {
  constructor() { this.items = new Set() }
  add(...names) { for (const name of names) this.items.add(name) }
  remove(...names) { for (const name of names) this.items.delete(name) }
  contains(name) { return this.items.has(name) }
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase()
    this.children = []
    this.attributes = {}
    this.style = {}
    this.dataset = {}
    this.classList = new ClassList()
    this._text = ''
    this.innerHTML = ''
    this.isContentEditable = false
    this.value = ''
  }
  get className() { return [...this.classList.items].join(' ') }
  set className(value) { this.classList.items = new Set(String(value).split(/\s+/).filter(Boolean)) }
  get textContent() { return this._text }
  set textContent(value) { this._text = String(value) }
  get innerText() { return this._text }
  set innerText(value) { this._text = String(value) }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return this.attributes[name] ?? null }
  append(...nodes) { for (const node of nodes) this.children.push(node) }
  appendChild(node) { this.children.push(node); return node }
  remove() { this.removed = true }
  addEventListener() {}
  removeEventListener() {}
  attachShadow() { this.shadowRoot = new Element('shadow-root'); return this.shadowRoot }
  closest() { return null }
  get offsetWidth() { return 100 }
  blur() {}
}

const html = new Element('html')
html.lang = 'en-US'
const body = new Element('body')
const documentStub = {
  documentElement: html,
  body,
  head: new Element('head'),
  createElement: tag => new Element(tag),
  querySelector: () => null,
  activeElement: null,
}
const listeners = new Map()
const windowStub = {
  location: { search: '' },
  setTimeout: (fn) => { fn(); return 0 },
  clearTimeout: () => {},
  addEventListener: (name, handler) => {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name).add(handler)
  },
  removeEventListener: (name, handler) => { listeners.get(name)?.delete(handler) },
}

const sandbox = {
  window: windowStub,
  document: documentStub,
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'MacIntel',
    maxTouchPoints: 0,
  },
  Intl,
  Date,
  Math,
  JSON,
  console,
  fetch: async () => ({ ok: true, json: async () => ({ signals: [] }) }),
  setTimeout: windowStub.setTimeout,
  clearTimeout: windowStub.clearTimeout,
  Element,
}
sandbox.globalThis = sandbox
windowStub.setTimeout = (fn) => { fn(); return 0 }
windowStub.document = documentStub

/* --------------------------- module loader --------------------------- */
let registration = null
sandbox.window.__ModuleLoader__ = { load: (value) => { registration = value } }

const context = vm.createContext(sandbox)
vm.runInContext(code, context, { filename: 'lib/client.js' })

if (registration === null) throw new Error('bundle never called __ModuleLoader__.load')
if (registration.id !== 'dsh-american-detector') throw new Error(`wrong bundle id: ${registration.id}`)
const exportsObject = registration.factory(() => { throw new Error('unexpected require') })
if (typeof exportsObject.apply !== 'function') throw new Error('bundle exports no apply')

/* ----------------------------- fake ctx ------------------------------ */
const effects = []
const fired = []
const submissions = []
let submissionListener = null
const session = {
  getSnapshot: () => ({ pendingSubmissions: submissions.slice() }),
  subscribe: (listener) => { submissionListener = listener; return () => { submissionListener = null } },
}
const ctx = {
  logger: { info: () => {}, warn: () => {} },
  get: (name) => (name === 'sessions' ? sessionsService : undefined),
  effect: (fn) => { effects.push(fn()) },
  slots: { inject: () => {}, register: () => () => {} },
}
const sessionsService = {
  list: { getSnapshot: () => ({ ids: ['session-1'] }), subscribe: () => () => {} },
  binding: () => ({ session }),
}

exportsObject.apply(ctx)

const report = () => ({
  score: windowStub.__AMERICAN_DETECTOR__ ? windowStub.__AMERICAN_DETECTOR__.verdict().score : 'n/a',
  american: windowStub.__AMERICAN_DETECTOR__.verdict().american,
})

/* ------------------------------- assert ------------------------------ */
const overlayHost = () => body.children.find(node => node.getAttribute('data-dsh-american-detector') === 'overlay')

console.log('1. verdict from browser signals:', JSON.stringify(report()))
if (report().american !== true) throw new Error('en-US + America time zone + Chrome should decide "American"')

// Simulate a send: a new pending submission echo appears.
submissions.push({ requestId: 'r1', time: Date.now(), text: 'hello' })
submissionListener?.()
const host = overlayHost()
if (host === undefined) throw new Error('no overlay mounted after a send')
/** Collect every element in a (possibly shadow) subtree. */
const allElements = (node, out = []) => {
  out.push(node)
  for (const child of node.children ?? []) allElements(child, out)
  if (node.shadowRoot !== undefined && node.shadowRoot !== null) allElements(node.shadowRoot, out)
  return out
}
const markup = allElements(host).map(node => node.innerHTML).join('\n')
if (!markup.includes('您的账户已被封禁')) throw new Error('dialog does not carry the ban headline')
if (!markup.includes('假的恶搞弹窗')) throw new Error('dialog is missing its prank disclaimer')
console.log('2. overlay mounted after send; headline + disclaimer present')

// Any key dismisses.
const keydowns = listeners.get('keydown') ?? new Set()
if (keydowns.size === 0) throw new Error('no keydown listeners registered')
let prevented = false
for (const handler of keydowns) handler({ key: 'x', preventDefault: () => { prevented = true }, stopPropagation: () => {}, stopImmediatePropagation: () => {}, target: body })
if (!prevented) throw new Error('dismissal did not consume the key')
if (host.style.display !== 'none') throw new Error('overlay did not hide on keypress')
console.log('3. any-key dismissal works; overlay hidden')

// A second send re-opens it.
submissions.push({ requestId: 'r2', time: Date.now(), text: 'again' })
submissionListener?.()
if (host.style.display === 'none') throw new Error('overlay did not re-open on the next send')
console.log('4. overlay re-opens on the next instruction')

// A non-American setup must not fire.
sandbox.navigator.language = 'zh-CN'
sandbox.navigator.languages = ['zh-CN', 'zh']
windowStub.__AMERICAN_DETECTOR__.hide()
const before = windowStub.__AMERICAN_DETECTOR__.opens()
submissions.push({ requestId: 'r3', time: Date.now(), text: 'third' })
submissionListener?.()
const after = windowStub.__AMERICAN_DETECTOR__.opens()
console.log(`5. zh-CN user: verdict=${JSON.stringify(report())} opens ${before} -> ${after}`)
if (report().american !== false) throw new Error('zh-CN should not be judged American without host signals')
if (after !== before) throw new Error('overlay fired for a non-American user')

console.log('\nall client smoke tests passed')
