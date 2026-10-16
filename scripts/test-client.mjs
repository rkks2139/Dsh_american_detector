#!/usr/bin/env node
/**
 * Headless smoke test for the fake ban dialog and its verdict memory.
 *
 * The periodic login gate is disabled here (?dsh-gate=0) because
 * scripts/test-gate.mjs owns it; these cases are about the American verdict,
 * the rolling history latch, and any-key dismissal.
 *
 * Usage: node scripts/test-client.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createHarness, materialize, Event } from './dom-harness.mjs'
import { scoreSignals } from '../src/client/score.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'lib/client.js')

const assert = (condition, message) => { if (!condition) throw new Error(message) }

/** Boot one page with the gate off, plus a session that can send instructions. */
function page(options = {}) {
  const harness = createHarness()
  harness.document.documentElement.lang = options.pageLanguage ?? 'en'
  harness.window.location.search = options.search ?? '?dsh-gate=0'
  for (const [key, value] of Object.entries(options.storage ?? {})) harness.storage.set(key, value)
  const context = vm.createContext(harness.sandbox)
  const exportsObject = materialize(context, bundle, vm)

  let submissions = []
  let submissionListener = null
  const session = {
    getSnapshot: () => ({ pendingSubmissions: submissions.slice() }),
    subscribe: (listener) => { submissionListener = listener; return () => { submissionListener = null } },
  }
  const sessions = {
    list: { getSnapshot: () => ({ ids: ['session-1'] }), subscribe: () => () => {} },
    binding: () => ({ session }),
  }
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    get: name => (name === 'sessions' ? sessions : undefined),
    effect: (fn) => { fn() },
    slots: { inject: () => {}, register: () => () => {} },
  }
  exportsObject.apply(ctx)
  harness.flushTimers()

  return {
    ...harness,
    ctx,
    exportsObject,
    api: () => harness.window.__AMERICAN_DETECTOR__,
    send(text = 'hi') {
      submissions = [...submissions, { requestId: Math.random().toString(36).slice(2), time: Date.now(), text }]
      submissionListener?.()
      harness.flushTimers()
    },
    /** Re-apply onto a fresh session binding, as a new conversation would. */
    reapply() {
      submissions = []
      submissionListener = null
      exportsObject.apply(ctx)
      harness.flushTimers()
    },
    banHost: () => harness.body.children.find(node => node.getAttribute('data-dsh-american-detector') === 'overlay'),
    /** Press any key on the page. */
    pressKey(key = 'x') {
      let prevented = false
      for (const handler of harness.listeners.get('keydown') ?? []) {
        handler(new Event('keydown', { key, target: harness.body, preventDefault: () => { prevented = true } }))
      }
      return prevented
    },
  }
}

/* ------------------------------------------------------------------ *
 * 1-4. An American browser raises the ban dialog on every send
 * ------------------------------------------------------------------ */
const p = page()
const first = p.api().verdict()
console.log('1. verdict:', JSON.stringify({ verdict: first.american, total: first.total, threshold: first.threshold, model: first.model }))
assert(first.model === 'v2', `expected the v2 model, got ${first.model}`)
assert(first.american === true, `en-US + US time zone + Chrome + English page must decide "American" (got ${first.total}/${first.threshold})`)
assert(first.signals.some(signal => signal.id === 'browser-language' && signal.logit > 0), 'the browser language must be a positive term')
assert(first.foldedCount > 0, 'co-firing signals must be folded, not counted twice')

p.send('hello')
const host = p.banHost()
assert(host !== undefined, 'no ban overlay mounted after a send')
const markup = host.allMarkup()
assert(markup.includes('您的账户已被封禁'), 'dialog does not carry the ban headline')
console.log('2. ban overlay mounted after a send; headline present')

// The scorecard is hidden by default: the first screen is the verdict alone.
const card = () => host.shadowRoot.querySelector('.card')
const detailsButton = () => card().querySelector('[data-details]')
const detailsPane = () => card().querySelector('.details')
assert(detailsButton() !== null, 'the dialog must offer a 判定依据 toggle')
assert(detailsPane() !== null, 'the details pane must exist in the DOM')
assert(!detailsPane().classList.contains('open'), 'the scorecard must be collapsed by default on the card')
assert(markup.includes('查看判定依据'), 'the toggle must invite expanding the evidence')
assert(host.allMarkup().includes('假的恶搞'), 'the prank disclaimer must be reachable')
const button = detailsButton()
button.dispatchEvent(new Event('click', { target: button }))
assert(card().classList.contains('open'), 'clicking the toggle must open the scorecard')
const openMarkup = detailsPane().descendantText()
assert(openMarkup.includes('对数几率'), 'expanding must reveal the scorecard')
assert(openMarkup.includes('正向证据'), 'the expanded pane must explain the row markers')
console.log('   details: collapsed by default, expands on 查看判定依据')

assert(p.pressKey('x') === true, 'dismissal did not consume the key')
p.flushTimers() // the hide runs on a 150ms transition timer
assert(host.style.display === 'none', 'overlay did not hide on keypress')
console.log('3. any-key dismissal works; overlay hidden')

p.send('again')
assert(host.style.display !== 'none', 'overlay did not re-open on the next send')
console.log('4. overlay re-opens on the next instruction')

/* ------------------------------------------------------------------ *
 * 4b. The built-in keyword rule: typing 「test」 always bans
 * ------------------------------------------------------------------ */
{
  // A zh-CN browser with an empty history would never be judged American, so
  // anything that fires here is the keyword rule and nothing else.
  const quiet = page({ pageLanguage: 'zh-CN' })
  quiet.sandbox.navigator.language = 'zh-CN'
  quiet.sandbox.navigator.languages = ['zh-CN', 'zh']
  const api = quiet.api()
  console.log(`4b. baseline: total=${api.verdict().total} american=${api.verdict().american}`)
  assert(api.verdict().american === false, 'the baseline must not be American, or the test proves nothing')
  console.log(`    matcher: ${JSON.stringify({ test: api.matchesKeyword('TEST！'), latest: api.matchesKeyword('latest'), tester: api.matchesKeyword('tester') })}`)
  assert(api.matchesKeyword('test') === 'test', 'plain test must match')
  assert(api.matchesKeyword('  TEST！') === 'test', 'case and trailing punctuation must be ignored')
  assert(api.matchesKeyword('latest') === null, 'latest must not match')
  assert(api.matchesKeyword('tester') === null, 'tester must not match')
  assert(api.matchesKeyword('test the plugin') === null, 'a longer sentence must not match')

  const beforeOpens = api.opens()
  quiet.send('test')
  assert(api.opens() === beforeOpens + 1, 'typing test must raise the ban dialog')
  const overlay = quiet.banHost()
  assert(overlay !== undefined, 'the ban overlay must be mounted')
  const card = overlay.shadowRoot.querySelector('.card')
  assert(card.allMarkup().includes('内置触发词'), 'the dialog must name the keyword rule as the reason')
  assert(card.allMarkup().includes('关键词规则命中'), 'the dialog must flag the forced verdict')
  const afterForced = api.verdict()
  assert(afterForced.total < afterForced.threshold, `the evidence must stay non-American (got ${afterForced.total}/${afterForced.threshold})`)
  assert(afterForced.latched === false, 'a keyword hit must NOT latch the alarm')
  const memoryAfterForced = api.history()
  assert(memoryAfterForced.americanCount === 0, `no American row may be recorded, got ${memoryAfterForced.americanCount}`)
  assert(memoryAfterForced.forcedCount === 1, `the forced row must still be recorded for forensics, got ${memoryAfterForced.forcedCount}`)
  console.log(`4c. 「test」 forced the dialog; evidence stayed at ${afterForced.total}/${afterForced.threshold}; alarm NOT latched (forced rows: ${memoryAfterForced.forcedCount})`)

  // The keyword hit must leave no trace in the alarm: a normal instruction on
  // the very same page has to stay quiet afterwards.
  api.hide()
  quiet.flushTimers()
  const beforeNormal = api.opens()
  quiet.send('优化一下这个函数')
  assert(api.opens() === beforeNormal, 'a normal instruction must stay quiet after a keyword hit')
  assert(api.matchesKeyword('优化一下这个函数') === null, 'a normal instruction must not match the rule')
  console.log('4d. after a keyword hit the next normal instruction stays quiet (nothing latched)')

  // ?dsh-keywords=0 turns the rule off.
  const off = page({ search: '?dsh-gate=0&dsh-keywords=0', pageLanguage: 'zh-CN' })
  off.sandbox.navigator.language = 'zh-CN'
  off.sandbox.navigator.languages = ['zh-CN', 'zh']
  const beforeOff = off.api().opens()
  off.send('test')
  assert(off.api().opens() === beforeOff, '?dsh-keywords=0 must disable the rule')
  console.log('4e. ?dsh-keywords=0 disables the keyword rule')
}

/* ------------------------------------------------------------------ *
 * 4f. Fifty keyword hits still leave the 50-row alarm empty
 * ------------------------------------------------------------------ */
{
  const spam = page({ pageLanguage: 'zh-CN' })
  spam.sandbox.navigator.language = 'zh-CN'
  spam.sandbox.navigator.languages = ['zh-CN', 'zh']
  const api = spam.api()
  for (let index = 0; index < 55; index += 1) {
    api.hide()
    spam.flushTimers()
    spam.send('test')
  }
  const memory = api.history()
  const stored = JSON.parse(spam.storage.get('dsh-american-detector/history/v1'))
  console.log(`4f. after 55 keyword hits: rows=${memory.count}/${api.historyLimit} american=${memory.americanCount} forced=${memory.forcedCount} latched=${api.verdict().latched}`)
  assert(memory.count === api.historyLimit, `the window must stay at ${api.historyLimit}, got ${memory.count}`)
  assert(memory.forcedCount === api.historyLimit, `every stored row must be a forced row, got ${memory.forcedCount}`)
  assert(memory.americanCount === 0, `no keyword row may count as American, got ${memory.americanCount}`)
  assert(api.verdict().latched === false, 'the alarm must stay off no matter how often the keyword fires')
  assert(stored.every(row => row.american === false), 'every stored row must record american:false')
  assert(stored.every(row => row.forced === true && row.keyword === 'test'), 'every stored row must keep its forced marker')

  // The alarm is genuinely untouched: a normal instruction stays quiet.
  api.hide()
  spam.flushTimers()
  const before = api.opens()
  spam.send('正常指令')
  assert(api.opens() === before, 'a normal instruction must stay quiet after 55 keyword hits')
  console.log('    after 55 keyword hits a normal instruction is still quiet')
}

/* ------------------------------------------------------------------ *
 * 5. The rolling history records one row per send
 * ------------------------------------------------------------------ */
const memory = p.api().history()
console.log(`5. history: ${memory.count} rows, ${memory.americanCount} american, last=${memory.lastAmericanAt}`)
assert(memory.count === 2, `history should hold 2 rows, holds ${memory.count}`)
assert(typeof p.storage.get('dsh-american-detector/history/v1') === 'string', 'history was not persisted to storage')

/* ------------------------------------------------------------------ *
 * 6-7. The latch: an American row keeps the alarm on for a Chinese user
 * ------------------------------------------------------------------ */
p.sandbox.navigator.language = 'zh-CN'
p.sandbox.navigator.languages = ['zh-CN', 'zh']
p.api().hide()
const beforeLatch = p.api().opens()
p.send('zh-CN send')
const latched = p.api().verdict()
console.log(`6. zh-CN + history: total=${latched.total} raw=${latched.rawAmerican} american=${latched.american} latched=${latched.latched} opens ${beforeLatch} -> ${p.api().opens()}`)
assert(latched.latched === true, 'an American row in history must latch the alarm')
assert(p.api().opens() === beforeLatch + 1, 'the latched alarm must fire on the next instruction')
assert(p.banHost().allMarkup().includes('历史警报'), 'the dialog does not explain the history latch on its first screen')

p.api().clearHistory()
const beforeClean = p.api().opens()
p.send('clean send')
const clean = p.api().verdict()
console.log(`7. zh-CN + empty history: total=${clean.total} american=${clean.american} latched=${clean.latched} opens ${beforeClean} -> ${p.api().opens()}`)
assert(clean.american === false, 'zh-CN with an empty history should not be American')
assert(p.api().opens() === beforeClean, 'overlay fired for a non-American user')

/* ------------------------------------------------------------------ *
 * 8-9. ?dsh-ban=0 is the kill switch; export() is machine-readable
 * ------------------------------------------------------------------ */
const killed = page({
  search: '?dsh-gate=0&dsh-ban=0',
  storage: { 'dsh-american-detector/history/v1': JSON.stringify([{ at: Date.now(), american: true, score: 90 }]) },
})
console.log(`8. ?dsh-ban=0 with an American history row: american=${killed.api().verdict().american}`)
assert(killed.api().verdict().american === false, '?dsh-ban=0 must override the history latch')
assert(Number.isFinite(killed.api().verdict().total), 'the scorecard must still be readable')

const exported = JSON.parse(killed.api().export())
assert(Array.isArray(exported.history) && exported.gate !== undefined, 'export() must describe history and gate state')
console.log('9. export() returns valid JSON with history + gate state')

/* ------------------------------------------------------------------ *
 * 10. A v2 scorer reading v1 host rows must not go blind
 * ------------------------------------------------------------------ */
{
  const skew = page({
    search: '?dsh-gate=0',
    storage: { 'dsh-american-detector/history/v1': JSON.stringify([
      { at: Date.now() - 86_400_000, american: true, score: 72 },              // v1 row
      { at: Date.now(), model: 'v2', american: false, total: -2.9, threshold: 2.2 }, // v2 row
    ]) },
  })
  const oldRows = [
    { id: 'host-os', label: 'macOS', note: 'v1', weight: 8, value: 'darwin', hit: true },
    { id: 'us-software', label: '美国公司出品的软件', note: 'v1', weight: 18, value: '7 个', hit: true },
    { id: 'vpn', label: 'VPN / 代理', note: 'v1', weight: 16, value: 'utun0', hit: true },
  ]
  const scored = scoreSignals(oldRows, {})
  console.log(`10. v1 host rows under the v2 model: total=${scored.total} rows=${scored.signals.length} american=${scored.american}`)
  assert(scored.total > 0, 'v1 weighted rows must contribute, not score zero')
  assert(scored.signals.every(signal => typeof signal.logit === 'number'), 'every row must carry a logit after normalization')
  assert(scored.american === true, 'v1 evidence must still be able to decide')

  // History replay: the v1 row keeps latching, the v2 row is read by its own scale.
  const verdict = skew.api().verdict()
  console.log(`    history: v1 row latches=${verdict.latched} alarmCount=${verdict.historyAlarm}`)
  assert(verdict.latched === true, 'a v1 American row must keep the alarm latched')
  assert(verdict.historyAlarm === 1, `only the v1 row counts as American, got ${verdict.historyAlarm}`)
}

console.log('\nall ban-dialog tests passed')
