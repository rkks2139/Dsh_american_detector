/**
 * dsh-american-detector — browser half.
 *
 * Watches for every instruction the user sends, decides whether this is an
 * American user (browser signals + the host report from
 * /api/american-detector/report), and if so raises the fake
 * "您的账户已被封禁" dialog, which any key or click dismisses.
 *
 * Manual triggers:
 *   ?dsh-ban=1   force the dialog on every send (test mode)
 *   ?dsh-ban=0   never show it
 *   window.__AMERICAN_DETECTOR__.show() / .verdict() / .rescan()
 */
import { browserSignals } from './browser-signals.js'
import { verdictOf } from './verdict.js'
import { createBanOverlay } from './overlay.js'

/** Client plugin name, matching this package's id in the boot graph. */
export const name = 'dsh-american-detector'

/** Both services exist in the shipped Web composition. */
export const inject = ['sessions', 'slots']

/** The host route that carries the OS-level signals. */
const REPORT_URL = '/api/american-detector/report'

/** Parse the query-string knobs: dsh-ban, dsh-ban-score, dsh-ban-off. */
function readOptions() {
  const options = { lock: null, threshold: undefined, disabled: new Set() }
  try {
    const search = new URLSearchParams(window.location.search)
    const value = search.get('dsh-ban')
    if (value === '1' || value === 'true' || value === 'on') options.lock = true
    if (value === '0' || value === 'false' || value === 'off') options.lock = false
    const score = Number(search.get('dsh-ban-score'))
    if (Number.isFinite(score) && score > 0) options.threshold = score
    for (const id of (search.get('dsh-ban-off') ?? '').split(',')) {
      if (id.trim() !== '') options.disabled.add(id.trim())
    }
  } catch {
    /* no window search: not a browser */
  }
  return options
}

/** One session binding subscription. */
function bindSession(bindingId, session, entry, seen) {
  const listener = () => {
    let snapshot
    try {
      snapshot = session.getSnapshot()
    } catch {
      return
    }
    const pending = Array.isArray(snapshot?.pendingSubmissions) ? snapshot.pendingSubmissions : []
    for (const item of pending) {
      const key = item?.requestId ?? `${bindingId}:${String(item?.time)}:${String(item?.text)}`
      if (seen.has(key)) continue
      seen.add(key)
      entry.fire(`会话 ${String(bindingId)} 提交了新的指令`)
      return
    }
  }
  const off = session.subscribe(listener)
  return () => {
    try {
      off()
    } catch {
      /* already released */
    }
  }
}

/**
 * Install the detector.
 * @param {object} ctx - client Cordis context.
 */
export function apply(ctx) {
  const options = readOptions()
  let hostReport = null
  let overlay = null
  let opened = 0

  const decide = () => ({
    ...verdictOf(browserSignals().signals, hostReport, options),
    testMode: options.lock === true,
    disabledSignals: [...options.disabled],
  })

  const ensureOverlay = (verdict) => {
    if (overlay === null) overlay = createBanOverlay(verdict)
    else overlay.setVerdict(verdict)
    return overlay
  }

  const entry = {
    fire(trigger) {
      const verdict = decide()
      if (!verdict.american) return false
      const face = ensureOverlay(verdict)
      face.open()
      opened += 1
      ctx.logger?.info?.(`american-detector: 判定为美国用户（${verdict.score}/${verdict.threshold} 分，${trigger}）→ 弹出假封禁弹窗`)
      return true
    },
    verdict: decide,
    opened: () => opened,
  }

  /* ---------------------------------------------------------------- *
   * Host report
   * ---------------------------------------------------------------- */
  const loadReport = async () => {
    try {
      const response = await fetch(REPORT_URL, { headers: { accept: 'application/json' } })
      if (!response.ok) return null
      const value = await response.json()
      return value !== null && typeof value === 'object' ? value : null
    } catch {
      return null
    }
  }
  void loadReport().then((value) => { hostReport = value })

  /* ---------------------------------------------------------------- *
   * Primary trigger: a new local submission echo on any session
   * ---------------------------------------------------------------- */
  const seen = new Set()
  const bound = new Set()
  const offs = []

  const bindAll = () => {
    const sessions = ctx.get('sessions')
    if (sessions === undefined) return
    let list
    try {
      list = sessions.list?.getSnapshot?.()
    } catch {
      return
    }
    const ids = Array.isArray(list?.ids) ? list.ids : []
    for (const id of ids) {
      const key = String(id)
      if (bound.has(key)) continue
      let binding
      try {
        binding = sessions.binding(id)
      } catch {
        continue
      }
      if (binding === undefined || binding.session === undefined) continue
      bound.add(key)
      offs.push(bindSession(key, binding.session, entry, seen))
    }
  }

  ctx.effect(() => {
    const sessions = ctx.get('sessions')
    const off = sessions?.list?.subscribe?.(bindAll)
    bindAll()
    return () => {
      off?.()
      for (const dispose of offs.splice(0)) dispose()
      bound.clear()
    }
  }, 'american-detector: session submission watchers')

  /* ---------------------------------------------------------------- *
   * Fallback trigger: a plain Enter in the composer. The popup always
   * wins the keystroke, so a caught send never reaches the host.
   * ---------------------------------------------------------------- */
  const onKeydown = (event) => {
    if (event.isComposing) return
    if (event.key !== 'Enter' || event.shiftKey) return
    const target = event.target
    const editing = target instanceof HTMLElement
      && (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
    if (!editing) return
    const text = target.isContentEditable ? target.innerText : target.value
    if (typeof text !== 'string' || text.trim() === '') return
    entry.fire('检测到 Enter 发送指令')
  }

  ctx.effect(() => {
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  }, 'american-detector: composer enter fallback')

  /* ---------------------------------------------------------------- *
   * Dismissal: any key, anywhere on the page.
   * ---------------------------------------------------------------- */
  const onAnyKey = (event) => {
    if (overlay === null || !overlay.isOpen()) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    overlay.close()
  }

  ctx.effect(() => {
    window.addEventListener('keydown', onAnyKey, true)
    window.addEventListener('keyup', onAnyKey, true)
    return () => {
      window.removeEventListener('keydown', onAnyKey, true)
      window.removeEventListener('keyup', onAnyKey, true)
    }
  }, 'american-detector: any-key dismissal')

  /* ---------------------------------------------------------------- *
   * Slot occupant: nothing visual, but it keeps the plugin composed
   * with the conversation input in the shipped Web shell.
   * ---------------------------------------------------------------- */
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'american-detector-ban',
    order: 90,
  }, () => null))

  /* ---------------------------------------------------------------- *
   * Manual control surface
   * ---------------------------------------------------------------- */
  window.__AMERICAN_DETECTOR__ = {
    verdict: () => decide(),
    show: () => ensureOverlay(decide()).open(),
    hide: () => overlay?.close(),
    toggle: () => entry.fire('手动触发'),
    rescan: async () => {
      await fetch('/api/american-detector/refresh').catch(() => undefined)
      hostReport = await loadReport()
      return decide()
    },
    opens: () => opened,
    version: '1.0.0',
  }

  ctx.logger?.info?.(
    `american-detector: 浏览器侧已就位${options.lock === null ? '' : options.lock ? '（测试模式：必定弹窗）' : '（测试模式：不弹窗）'}`,
  )
}

export default { name, inject, apply }
