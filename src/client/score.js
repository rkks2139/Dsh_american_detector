/**
 * The scoring model: log-odds (a naive-Bayes addend) instead of a weighted sum.
 *
 * The v1 model added weights, which is wrong in two ways: probabilities do not
 * add, and it could not express *negative* evidence. Here every signal
 * contributes `L = ln(P(signal | American) / P(signal | non-American))`:
 *
 *   L > 0  the observation is more likely for an American user
 *   L < 0  the observation is more likely for a non-American user
 *   L = 0  the observation says nothing (including "informational" rows)
 *
 * The verdict is the sum against {@link THRESHOLD_LOGIT}. Raw logits are not
 * probabilities (the signals correlate, and the prior is not 50/50), so the
 * threshold is calibrated against archetypes by scripts/calibrate.mjs rather
 * than derived from the numbers.
 *
 * Co-firing signals are collapsed to one term by `group`, so three checks that
 * all really report "the browser UI is English" count once. See
 * docs/scoring.md for the coefficient table and its rationale.
 */

/** Decision boundary on summed log-odds. */
export const THRESHOLD_LOGIT = 2.2

/** The model version stamped into the verdict and the stored history. */
export const MODEL = 'v2'

/**
 * Scale used to read a v1 weighted row (0..22, boundary 60) as a logit.
 *
 * The host and client halves ship in one package but load at different times:
 * `patchReload: live` re-reads the Node half without a restart, while the
 * browser half only changes on a page render. So a v2 scorer can meet v1 host
 * rows. Reading their weight as a logit keeps the evidence visible instead of
 * silently scoring every row at zero.
 */
const LEGACY_WEIGHT_PER_LOGIT = 1 / 16.5

/**
 * Normalize a row that predates the log-odds model.
 * @param signal - a raw row from either model version.
 * @returns the row with `group` and `logit` guaranteed.
 */
export function normalizeSignal(signal) {
  if (signal === null || typeof signal !== 'object') return signal
  const hasLogit = typeof signal.logit === 'number'
  const weight = Number(signal.weight)
  const legacy = !hasLogit && Number.isFinite(weight) && signal.hit !== undefined
  const logit = hasLogit
    ? signal.logit
    : legacy ? (signal.hit === true ? weight * LEGACY_WEIGHT_PER_LOGIT : 0) : 0
  return {
    ...signal,
    group: signal.group ?? (legacy ? `legacy:${String(signal.id ?? 'unknown')}` : 'unknown'),
    logit,
    ...(legacy ? { note: `${signal.note ?? ''}（v1 主机行，按权重折算）` } : {}),
    ...(signal.informational === true || legacy ? {} : {}),
  }
}

/**
 * Fold the signals of one group into a single term.
 *
 * Within a group the most extreme logit wins and the rest are demoted to
 * informational rows, so correlated checks cannot multiply evidence.
 * @param signals - normalized signal rows.
 * @returns rows with per-group demotion applied.
 */
export function collapseGroups(signals) {
  const best = new Map()
  for (const signal of signals) {
    if (signal.informational === true || signal.logit === 0) continue
    const current = best.get(signal.group)
    if (current === undefined || Math.abs(signal.logit) > Math.abs(current.logit)) best.set(signal.group, signal)
  }
  return signals.map((signal) => {
    if (signal.informational === true || signal.logit === 0) return signal
    if (best.get(signal.group) === signal) return signal
    return { ...signal, demoted: true, note: `${signal.note}（与同组信号共因，已折叠，不重复计分）` }
  })
}

/**
 * Score a normalized signal list.
 * @param signals - rows from the host report and the browser collector.
 * @param options - { threshold } logit boundary override.
 * @returns the verdict: sum, the decisive rows, and the full scorecard.
 */
export function scoreSignals(signals, options = {}) {
  const normalized = signals
    .filter(signal => signal !== undefined && signal !== null)
    .map(normalizeSignal)
  const folded = collapseGroups(normalized)
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : THRESHOLD_LOGIT
  const contributing = folded.filter(signal => signal.informational !== true && signal.demoted !== true)
  const total = contributing.reduce((sum, signal) => sum + (Number(signal.logit) || 0), 0)
  const pros = contributing.filter(signal => signal.logit > 0)
  const cons = contributing.filter(signal => signal.logit < 0)
  const decisive = [...pros, ...cons]
    .sort((left, right) => Math.abs(right.logit) - Math.abs(left.logit))
    .slice(0, 4)

  return {
    american: total >= threshold,
    total: Number(total.toFixed(3)),
    threshold,
    model: MODEL,
    proCount: pros.length,
    conCount: cons.length,
    informationalCount: folded.filter(signal => signal.informational === true).length,
    foldedCount: folded.filter(signal => signal.demoted === true).length,
    proSum: Number(pros.reduce((sum, signal) => sum + signal.logit, 0).toFixed(3)),
    conSum: Number(cons.reduce((sum, signal) => sum + signal.logit, 0).toFixed(3)),
    reasons: decisive.filter(signal => signal.logit > 0).map(signal => signal.label).slice(0, 4),
    counterReasons: decisive.filter(signal => signal.logit < 0).map(signal => signal.label).slice(0, 4),
    signals: folded,
    at: new Date().toISOString(),
  }
}

/**
 * Replay a stored verdict row under the model that produced it.
 *
 * The history latches the alarm on any American row, so old rows must keep
 * meaning what they meant. Rows written by v1 store a weighted score against
 * its 60-point boundary; v2 rows store logits against this threshold. Rows
 * whose model cannot be identified by their shape are treated as v1, which is
 * the conservative reading: they fire the alarm.
 * @param row - one stored history row.
 * @returns true when the row counts as an American verdict.
 */
export function rowIsAmerican(row) {
  if (row === null || typeof row !== 'object') return false
  // Keyword-rule hits are stored for forensics but never latch the alarm.
  if (row.forced === true) return false
  if (row.american !== true && row.raw !== true) return false
  if (row.model === MODEL) return row.american === true
  // v1 rows, or rows predating the model field.
  return row.score === undefined || Number(row.score) >= 60
}

/**
 * Whether any row in a stored history still latches the alarm.
 * @param history - stored rows.
 * @returns { latched, count, last }.
 */
export function replayHistory(history) {
  const american = history.filter(rowIsAmerican)
  return {
    latched: american.length > 0,
    count: american.length,
    last: american[american.length - 1] ?? null,
  }
}
