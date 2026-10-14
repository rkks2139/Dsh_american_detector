/**
 * The verdict: fuse the browser-side and host-side signals into one
 * "is this an American user?" decision, with a legible scorecard.
 *
 * Hard rules mirror the brief: an English system language, an English browser,
 * a US time zone, or a US-browser fingerprint each decide the case alone.
 * Everything else accumulates score against a threshold.
 */

/** Score at or above which the account gets "banned". */
export const THRESHOLD = 60

/**
 * Fuse every signal into a verdict.
 * @param browserSignals - rows from browserSignals().
 * @param hostReport - the host report, or null when the route was unreachable.
 * @param options - { lock, threshold, disabled } overrides.
 * @returns the verdict: signals, score, reasons, hard rules and the boolean.
 */
export function verdictOf(browserSignals, hostReport, options = {}) {
  const disabled = options.disabled ?? new Set()
  const signals = [...browserSignals, ...(hostReport?.signals ?? [])]
    .filter(signal => signal !== undefined && !disabled.has(signal.id))
  const scored = signals.filter(signal => signal.informational !== true)
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : THRESHOLD
  const score = scored.reduce((sum, signal) => sum + (signal.hit === true ? Number(signal.weight) || 0 : 0), 0)
  const hardHits = scored.filter(signal => signal.hit === true && signal.hard === true)
  const normalHits = scored.filter(signal => signal.hit === true && signal.weak !== true)
  const hits = scored.filter(signal => signal.hit === true)

  const lock = options.lock ?? null
  let american = score >= threshold || hardHits.length > 0
  if (lock === true) american = true
  if (lock === false) american = false

  return {
    american,
    score,
    threshold,
    hardHits: hardHits.map(signal => signal.label),
    hitCount: hits.length,
    total: scored.length,
    signals: signals.map(signal => ({
      id: signal.id,
      label: signal.label,
      note: signal.note,
      weight: Number(signal.weight) || 0,
      value: String(signal.value ?? ''),
      hit: signal.hit === true,
      hard: signal.hard === true,
      informational: signal.informational === true,
    })),
    reasons: (hardHits.length > 0 && lock !== false ? hardHits : normalHits).map(signal => signal.label).slice(0, 6),
    hostError: hostReport?.error ?? null,
    at: new Date().toISOString(),
    ua: navigator.userAgent,
  }
}
