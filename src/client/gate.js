/**
 * The periodic "登录认证" gate.
 *
 * Every {@link DEFAULT_EVERY} instructions the user is forced through a fake
 * account-verification step: the phrase "中国人能飞" typed three times in a row
 * (Simplified Chinese only) plus a ten-second reCAPTCHA hold. It is pure
 * browser theatre — nothing is checked on a server and nothing is granted.
 *
 * State lives in `localStorage` so a page reload cannot skip the gate: the
 * pending challenge persists until it is actually passed.
 */

/** The memory key; bumped when the stored shape changes. */
const STATE_KEY = 'dsh-american-detector/gate/v1'

/** The phrase that must be transcribed, three times in a row. */
export const GATE_PHRASE = '中国人能飞'

/** Accepted transcriptions of the phrase (Simplified Chinese only). */
const PHRASE_FORMS = new Set([GATE_PHRASE])

/** How many lines the user must transcribe. */
export const PHRASE_REPEATS = 3

/** The fake reCAPTCHA hold, in milliseconds. */
export const CAPTCHA_HOLD_MS = 10_000

/** Instructions between gates, chosen per cycle from this range. */
export const DEFAULT_EVERY_MIN = 4
export const DEFAULT_EVERY_MAX = 5

/** Read the persisted counter + pending challenge. */
export function readGateState() {
  try {
    const raw = window.localStorage.getItem(STATE_KEY)
    if (raw === null || raw === '') return { turns: 0, nextAt: pickNext(), pending: false, passed: 0 }
    const parsed = JSON.parse(raw)
    return {
      turns: Number(parsed?.turns) || 0,
      nextAt: Number(parsed?.nextAt) || pickNext(),
      pending: parsed?.pending === true,
      passed: Number(parsed?.passed) || 0,
    }
  } catch {
    return { turns: 0, nextAt: pickNext(), pending: false, passed: 0 }
  }
}

/** Persist the counter + pending challenge. */
export function saveGateState(state) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable: the gate still works for this page */
  }
}

/** Drop the counter and any pending challenge. */
export function clearGateState() {
  try {
    window.localStorage.removeItem(STATE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Draw the next gate interval: 4 or 5 instructions. */
export function pickNext() {
  const span = DEFAULT_EVERY_MAX - DEFAULT_EVERY_MIN + 1
  return DEFAULT_EVERY_MIN + Math.floor(Math.random() * span)
}

/**
 * Advance the counter for one instruction that is actually going through.
 * @param state - state from {@link readGateState}.
 * @param force - force the gate open regardless of the counter.
 * @returns { state, trigger } — the saved state and whether to raise the gate.
 */
export function advanceGate(state, force = false) {
  const turns = state.turns + 1
  const trigger = force || turns >= state.nextAt
  // A triggered gate pins nextAt at the current count; passing it draws a new
  // interval. So the counter cannot run past the challenge and skip it.
  const saved = trigger
    ? { turns, pending: true, passed: state.passed, nextAt: turns }
    : { ...state, turns }
  saveGateState(saved)
  return { state: saved, trigger }
}

/** Mark the pending challenge as passed and schedule the next one. */
export function passGate(state) {
  const next = { turns: 0, nextAt: pickNext(), pending: false, passed: state.passed + 1 }
  saveGateState(next)
  return next
}

/**
 * Record that the challenge is now on screen, so a reload re-raises it instead
 * of letting the counter walk past.
 * @param state - state from {@link readGateState}.
 * @returns the saved state with `pending: true`.
 */
export function markGatePending(state) {
  const next = { ...state, pending: true }
  saveGateState(next)
  return next
}

/**
 * Normalize one transcription for comparison: drop every space and every
 * punctuation mark (ASCII and CJK), so an IME's full-width comma cannot fail
 * an otherwise correct line.
 * @param value - raw input.
 * @returns the comparable text.
 */
export function normalizePhrase(value) {
  return String(value ?? '')
    .replace(/[\s\u3000]/gu, '')
    .replace(/[，,。.、！!？?；;：:""''"'（）()《》〈〉【】\[\]—\-_~·]/gu, '')
}

/** Whether a transcription is one acceptable occurrence of the phrase. */
export function phraseAccepted(value) {
  return PHRASE_FORMS.has(normalizePhrase(value))
}
