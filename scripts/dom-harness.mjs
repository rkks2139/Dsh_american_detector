/**
 * Shared headless browser stub for the client smoke tests.
 *
 * Implements just enough of the DOM to materialize the plugin bundles, walk
 * shadow trees, dispatch pointer events, and inspect what a dialog rendered —
 * no jsdom, no install.
 */
import { readFileSync } from 'node:fs'

/** A class list that survives `className = "a b"`. */
class ClassList {
  constructor() { this.items = new Set() }
  add(...names) { for (const name of names) this.items.add(name) }
  remove(...names) { for (const name of names) this.items.delete(name) }
  contains(name) { return this.items.has(name) }
  toggle(name, on) { if (on === true) this.items.add(name); else this.items.delete(name) }
  get value() { return [...this.items].join(' ') }
}

/** Elements that never take children. */
const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link'])

/** Decode the handful of entities the templates emit. */
function decodeEntities(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

/**
 * Parse an HTML string into element stubs and append them to `parent`.
 *
 * The templates are small and well-formed (every tag is closed, attributes are
 * double-quoted), so a tokenizer is enough; a malformed input degrades to text
 * rather than throwing.
 * @param parent - element receiving the parsed nodes.
 * @param html - the markup.
 */
function parseInto(parent, html) {
  const token = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>/g
  const stack = [parent]
  let cursor = 0
  let match
  while ((match = token.exec(html)) !== null) {
    const text = html.slice(cursor, match.index)
    if (text.trim() !== '') {
      const target = stack[stack.length - 1]
      target._text += decodeEntities(text)
    }
    cursor = match.index + match[0].length
    const [, closing, tag, rawAttributes, selfClosing] = match
    if (closing === '/') {
      if (stack.length > 1) stack.pop()
      continue
    }
    const element = new Element(tag)
    const attribute = /([\w-]+)(?:="([^"]*)")?/g
    let found
    while ((found = attribute.exec(rawAttributes)) !== null) {
      const value = decodeEntities(found[2] ?? '')
      element.attributes[found[1]] = value
      if (found[1] === 'class') element.className = value
      if (found[1] === 'disabled') element.disabled = true
      if (found[1] === 'value') element.value = value
    }
    stack[stack.length - 1].appendChild(element)
    if (selfClosing !== '/' && !VOID_TAGS.has(tag.toLowerCase())) stack.push(element)
  }
  const tail = html.slice(cursor)
  if (tail.trim() !== '') stack[stack.length - 1]._text += decodeEntities(tail)
}

/** A DOM element stub with shadow-root, listener, and event support. */
export class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase()
    this.children = []
    this.parentNode = null
    this.attributes = {}
    this.style = {}
    this.dataset = {}
    this.classList = new ClassList()
    this.listeners = new Map()
    this._text = ''
    this._html = ''
    this.isContentEditable = false
    this.value = ''
    this.disabled = false
    this.removed = false
    this.shadowRoot = null
  }
  get className() { return this.classList.value }
  set className(value) { this.classList.items = new Set(String(value).split(/\s+/).filter(Boolean)) }
  get textContent() { return this._text }
  set textContent(value) { this._text = String(value) }
  get innerText() { return this._text }
  set innerText(value) { this._text = String(value) }
  get innerHTML() { return this._html }
  set innerHTML(value) {
    this._html = String(value)
    this.children = []
    // Templates are assigned as markup, so parse them into (queryable) element
    // stubs. `_html` keeps the raw string for text assertions.
    parseInto(this, this._html)
  }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return this.attributes[name] ?? null }
  removeAttribute(name) { delete this.attributes[name] }
  append(...nodes) { for (const node of nodes) this.appendChild(node) }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node }
  remove() { this.removed = true; if (this.parentNode !== null) this.parentNode.children = this.parentNode.children.filter(child => child !== this) }
  attachShadow() { this.shadowRoot = new Element('shadow-root'); this.shadowRoot.host = this; return this.shadowRoot }
  getRootNode() { return this.shadowRoot !== null ? this.shadowRoot : this }
  get offsetWidth() { return 100 }
  blur() {}
  focus() { this.focused = true }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name).add(handler)
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler) }
  dispatchEvent(event) {
    event.target ??= this
    const handlers = [...(this.listeners.get(event.type) ?? [])]
    for (const handler of handlers) handler(event)
    return event
  }
  /** Path used by `composedPath()`: this element, its shadow root hosts, then body. */
  composedPath() {
    const path = [this]
    let node = this
    while (node.parentNode !== null) { path.push(node.parentNode); node = node.parentNode }
    if (this.shadowRoot !== null) path.push(this.shadowRoot)
    return path
  }
  /** Depth-first element walk including shadow roots. */
  allElements(out = []) {
    out.push(this)
    for (const child of this.children) child.allElements(out)
    if (this.shadowRoot !== null) this.shadowRoot.allElements(out)
    return out
  }
  /**
   * Text of this element's parsed descendants only.
   *
   * Use this to assert what a specific subtree contains: a subtree can also
   * carry a raw `_html` template string from an earlier assignment, and its
   * parsed children do not repeat that string.
   */
  descendantText() {
    return this.allElements().slice(1).map(node => node._text).filter(text => text !== '').join('\n')
  }

  /**
   * Text of every descendant's markup, for content assertions.
   *
   * A dialog writes its template into one element's innerHTML, so the raw
   * string is only visible on that element; walking the parsed children alone
   * would show their children instead of the template.
   */
  allMarkup() {
    const parts = []
    for (const node of this.allElements()) {
      if (node._html !== '') parts.push(node._html)
      if (node.shadowRoot !== null && node.shadowRoot !== undefined) {
        for (const inner of node.shadowRoot.allElements()) {
          if (inner._html !== '') parts.push(inner._html)
        }
      }
    }
    return parts.join('\n')
  }
  /** Minimal selector engine: tag, [attr], [attr="v"], .class, and compounds. */
  querySelector(selector) {
    for (const node of this.allElements()) {
      if (node !== this && node.matches(selector)) return node
    }
    return null
  }
  querySelectorAll(selector) {
    return this.allElements().filter(node => node !== this && node.matches(selector))
  }
  matches(selector) {
    return String(selector).split(',').some(part => this.matchesOne(part.trim()))
  }
  matchesOne(selector) {
    const attr = /\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/.exec(selector)
    if (attr !== null) {
      const value = this.attributes[attr[1]]
      if (value === undefined) return false
      if (attr[2] !== undefined && attr[2] !== '' && value !== attr[2]) return false
    }
    const cls = /\.([\w-]+)/.exec(selector)
    if (cls !== null && !this.classList.contains(cls[1])) return false
    const tag = /^[a-zA-Z][\w-]*/.exec(selector)
    if (tag !== null && this.tagName !== tag[0].toUpperCase()) return false
    return true
  }
}

/** A minimal event with the members the plugin touches. */
export class Event {
  constructor(type, init = {}) {
    this.type = type
    Object.assign(this, init)
    this.defaultPrevented = false
  }
  preventDefault() { this.defaultPrevented = true }
  stopPropagation() { this.propagationStopped = true }
  stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true }
  composedPath() { return this.target?.composedPath?.() ?? [] }
}

/**
 * Build the whole sandbox: window, document, navigator, storage, timers.
 * @param overrides - navigator fields and a fetch implementation to override.
 * @returns { sandbox, window, document, body, listeners, storage, flushTimers }
 */
export function createHarness(overrides = {}) {
  const html = new Element('html')
  html.lang = 'en-US'
  const body = new Element('body')
  const head = new Element('head')
  const documentStub = {
    documentElement: html,
    body,
    head,
    createElement: tag => new Element(tag),
    querySelector: () => null,
    activeElement: null,
  }

  const listeners = new Map()
  const timers = new Map()
  let timerSeq = 0
  const windowStub = {
    location: { search: '' },
    // Timers are deferred so a handler can finish rendering before its timeout
    // fires; flushTimers() runs them in order.
    setTimeout: (fn, delay = 0) => { timerSeq += 1; timers.set(timerSeq, { fn, delay }); return timerSeq },
    clearTimeout: (id) => { timers.delete(id) },
    addEventListener: (name, handler) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(handler)
    },
    removeEventListener: (name, handler) => { listeners.get(name)?.delete(handler) },
  }

  const storage = new Map()
  const localStorageStub = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: key => { storage.delete(key) },
  }
  windowStub.localStorage = localStorageStub

  const sandbox = {
    window: windowStub,
    document: documentStub,
    navigator: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      language: 'en-US',
      languages: ['en-US', 'en'],
      platform: 'MacIntel',
      maxTouchPoints: 0,
      ...overrides.navigator,
    },
    Intl,
    Date,
    Math,
    JSON,
    console,
    URLSearchParams,
    URL,
    Event,
    Element,
    localStorage: localStorageStub,
    fetch: overrides.fetch ?? (async () => ({ ok: true, json: async () => ({ signals: [] }) })),
    setTimeout: windowStub.setTimeout,
    clearTimeout: windowStub.clearTimeout,
  }
  sandbox.globalThis = sandbox

  /**
   * Run pending timers in scheduling order (default) or only those with the
   * given delay; timers they schedule join the same pass.
   * @param options - { only: delayMs } to restrict which timers run.
   */
  const flushTimers = (options = {}) => {
    for (let guard = 0; guard < 50; guard += 1) {
      const entries = [...timers.entries()]
        .filter(([, timer]) => options.only === undefined || timer.delay === options.only)
        .sort((left, right) => left[1].delay - right[1].delay)
      if (entries.length === 0) return
      const [id, entry] = entries[0]
      timers.delete(id)
      entry.fn()
    }
  }

  /** Every scheduled timer, for cancel-style assertions. */
  const pendingTimers = () => [...timers.entries()]

  return {
    sandbox,
    window: windowStub,
    document: documentStub,
    body,
    html,
    listeners,
    storage,
    flushTimers,
    pendingTimers,
  }
}

/**
 * Load a built bundle into a fresh vm context.
 * @param context - a vm context created from the harness sandbox.
 * @param path - the bundle file.
 * @returns the materialized plugin exports.
 */
export function materialize(context, path, vm) {
  const code = readFileSync(path, 'utf8')
  let registration = null
  context.window.__ModuleLoader__ = { load: (value) => { registration = value } }
  vm.runInContext(code, context, { filename: path })
  if (registration === null) throw new Error(`${path}: bundle never called __ModuleLoader__.load`)
  return registration.factory(() => { throw new Error(`${path}: unexpected require`) })
}
