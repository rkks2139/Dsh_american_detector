/**
 * The rolling verdict memory.
 *
 * Every instruction that is sent evaluates the detector and appends one row
 * here, so "yesterday it fired, today it does not" stops being a mystery: the
 * last {@link HISTORY_LIMIT} rows are kept and any single "American" row keeps
 * the alarm latched.
 *
 * The store is `localStorage`, so it survives reloads and the whole day. Every
 * operation is defensive: a browser with storage disabled (private mode, a
 * hardened profile) still gets a working detector, just without the memory.
 */

/** How many verdicts the memory keeps. */
export const HISTORY_LIMIT = 50

/** The storage key; bumped when the row shape changes. */
export const HISTORY_KEY = 'dsh-american-detector/history/v1'

/** Read the stored history, newest last; `[]` when absent or unreadable. */
export function readHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (raw === null || raw === '') return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(row => row !== null && typeof row === 'object').slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

/** Append one row, dropping the oldest so the list stays at the limit. */
export function pushHistory(history, row) {
  const next = [...history, row]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

/** Persist the history; failure is not fatal. */
export function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)))
  } catch {
    /* storage full or unavailable: the detector still works, just forgets */
  }
}

/** Drop the stored history. */
export function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Summarize a history for the console and the overlay.
 * @param history - rows from {@link readHistory}.
 * @returns counts, the newest rows, and the latch state.
 */
export function summarizeHistory(history) {
  // Forced (keyword-rule) rows are excluded here for the same reason they are
  // excluded from the latch: they carry no reading of the evidence.
  const american = history.filter(row => (row.american === true || row.raw === true) && row.forced !== true)
  const forced = history.filter(row => row.forced === true)
  const last = american[american.length - 1]
  return {
    count: history.length,
    americanCount: american.length,
    forcedCount: forced.length,
    latched: american.length > 0,
    lastAmericanAt: last === undefined ? null : new Date(last.at).toLocaleString('zh-CN'),
    lastAmericanScore: last === undefined ? null : last.score,
    scores: history.map(row => row.score),
    rows: history.slice(-12),
  }
}
