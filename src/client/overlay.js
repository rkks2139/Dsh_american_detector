/**
 * The fake ban dialog.
 *
 * Deliberately looks like a platform enforcement notice, but it is inert: it
 * renders into its own shadow root, dismisses on any key or click, and blocks
 * the page only while open.
 *
 * Layout: a full-screen notice that fills the viewport, with the verdict alone
 * on the first screen and the evidence scorecard collapsed behind 判定依据.
 */

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; inset: 0; z-index: 2147483600;
  display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; padding: clamp(12px, 3vh, 34px);
  background: var(--dsh-overlay-backdrop, rgba(6, 9, 18, 0.72));
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  font-family: var(--dsh-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  color: var(--dsh-color-text, #e8ecf4);
  opacity: 0; transform: scale(0.99);
  transition: opacity 150ms ease, transform 150ms ease;
}
.wrap.in { opacity: 1; transform: scale(1); }
.card {
  display: flex; flex-direction: column; gap: 0;
  width: 100%; height: 100%; max-width: 1600px; box-sizing: border-box;
  padding: clamp(20px, 4vh, 44px) clamp(20px, 4vw, 56px);
  border-radius: 20px; overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(235, 64, 64, 0.13) 0%, transparent 62%),
    var(--dsh-color-surface, #14171f);
  border: 1px solid rgba(235, 64, 64, 0.28);
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.6);
}
.hero {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; text-align: center;
  overflow: auto; padding: 8px 0;
}
.mark {
  width: clamp(56px, 9vh, 88px); height: clamp(56px, 9vh, 88px);
  border-radius: 50%; display: grid; place-items: center;
  font-size: clamp(26px, 4.2vh, 40px); font-weight: 900; color: #ff6b6b;
  background: rgba(235, 64, 64, 0.12); border: 2px solid rgba(235, 64, 64, 0.45);
  box-shadow: 0 0 0 10px rgba(235, 64, 64, 0.06);
}
h1 { margin: 0; font-size: clamp(28px, 5.2vh, 54px); line-height: 1.2; font-weight: 850; letter-spacing: .01em; }
h2 { margin: 0; font-size: clamp(11px, 1.5vh, 14px); font-weight: 600; letter-spacing: .3em; text-transform: uppercase; color: #ff8080; }
.lead { margin: 0; max-width: 46ch; font-size: clamp(13px, 1.75vh, 16px); line-height: 1.7; color: var(--dsh-color-text-secondary, #b9c2d4); }
.notes { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.testmode { margin: 0; font-size: 12px; color: #ffb454; }
.keyword { margin: 0; font-size: 12px; color: #ff9f43; }
.latched { margin: 0; font-size: 12px; color: #ff8f5c; }
.bar {
  flex: none; display: flex; align-items: center; justify-content: center; gap: 12px;
  flex-wrap: wrap; padding-top: clamp(12px, 2.4vh, 22px);
}
button {
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  padding: 10px 20px; border-radius: 10px; color: #fff;
  background: #d93a3a; border: 1px solid #e45555;
}
button:hover { background: #c73333; }
button.ghost { color: #c9d3e4; background: transparent; border: 1px solid rgba(255, 255, 255, 0.18); }
button.ghost:hover { background: rgba(255, 255, 255, 0.06); }
.hint { font-size: 12px; color: var(--dsh-color-text-secondary, #98a2b8); }
/* ---- details pane ---- */
.details {
  flex: 1; min-height: 0; display: none; flex-direction: column; gap: 12px;
  padding-top: clamp(14px, 2.6vh, 26px); overflow: auto;
}
.card.open .hero { flex: none; padding-bottom: 4px; }
.card.open .details { display: flex; }
.details-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.details-head strong { font-size: 14px; }
.details-head span { font-size: 12px; color: var(--dsh-color-text-secondary, #aab3c6); }
.gauge { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.09); overflow: hidden; }
.gauge i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ff9f43, #ff4d4f); }
.meta {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 18px;
  padding: 12px 14px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.035); border: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.08));
  font-size: 12px; color: var(--dsh-color-text-secondary, #aab3c6);
}
.meta b { color: var(--dsh-color-text, #e8ecf4); font-weight: 600; }
ul.rows {
  list-style: none; margin: 0; padding: 0;
  columns: 2; column-gap: clamp(16px, 3vw, 40px);
}
@media (max-width: 900px) { ul.rows { columns: 1; } }
ul.rows li {
  break-inside: avoid;
  display: grid; grid-template-columns: 16px 1fr auto; gap: 10px; align-items: start;
  padding: 9px 0; border-top: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.07));
  font-size: 12.5px;
}
.tick { color: #ff5c5c; font-weight: 700; }
.tick.off { color: #4b5468; }
.tick.neg { color: #4fbf8f; }
.row-why { display: block; margin-top: 3px; color: var(--dsh-color-text-secondary, #98a2b8); font-size: 11.5px; line-height: 1.5; word-break: break-word; }
.row-num { font-variant-numeric: tabular-nums; font-size: 11.5px; color: #ff9f9f; padding-top: 2px; }
.row-num.off { color: #4b5468; }
.row-num.neg { color: #4fbf8f; }
.prank { margin: 0; font-size: 11px; color: var(--dsh-color-text-secondary, #7f8899); line-height: 1.6; }
`

/** Stable small hash for the fake account number. */
function hash(text) {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value | 0
}

/**
 * Render the dialog once and return its control face.
 * @param verdict - the fused verdict to display.
 * @param options - { detailsOpen } to start with the scorecard expanded.
 * @returns { isOpen, open, close, toggle, setVerdict, destroy }
 */
export function createBanOverlay(verdict, options = {}) {
  const host = document.createElement('div')
  host.setAttribute('data-dsh-american-detector', 'overlay')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  root.append(style)

  const wrap = document.createElement('div')
  wrap.className = 'wrap'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  const card = document.createElement('div')
  card.className = 'card'
  wrap.append(card)
  root.append(wrap)

  let current = verdict
  let open = false
  let detailsOpen = options.detailsOpen === true

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

  const render = () => {
    const v = current
    const shown = v.signals.filter(signal => signal.informational !== true)
    const rows = shown.map((signal) => {
      const logit = Number(signal.logit) || 0
      const cls = signal.demoted === true ? 'off' : logit > 0 ? '' : logit < 0 ? 'neg' : 'off'
      const mark = signal.demoted === true ? '▪' : logit > 0 ? '●' : logit < 0 ? '◆' : '○'
      const shownValue = signal.demoted === true ? '折叠' : logit === 0 ? '0' : `${logit > 0 ? '+' : ''}${logit.toFixed(2)}`
      return `
      <li>
        <span class="tick ${cls}">${mark}</span>
        <span><b>${esc(signal.label)}</b>：${esc(signal.value)}
          <span class="row-why">${esc(signal.note)}</span>
        </span>
        <span class="row-num ${cls}">${esc(shownValue)}</span>
      </li>`
    }).join('')

    const threshold = Number(v.threshold) || 0
    const percent = Math.max(4, Math.min(100, Math.round((v.total / Math.max(threshold, 0.001)) * 100)))
    const account = `DSH-${String(Math.abs(hash(v.ua + v.at)) % 900000 + 100000)}`

    card.className = `card${detailsOpen ? ' open' : ''}`
    card.innerHTML = `
      <div class="hero">
        <div class="mark">!</div>
        <h1>您的账户已被封禁</h1>
        <h2>Your account has been suspended</h2>
        <p class="lead">${v.forced === true
          ? `检测到指令内容为内置触发词「${esc(v.keyword)}」，依据《区域可用性政策》第 4.2 条永久封禁。`
          : '系统检测到本机使用者为美国用户，依据《区域可用性政策》第 4.2 条永久封禁。'}</p>
        <div class="notes">
          ${v.forced === true ? `<p class="keyword">※ 关键词规则命中：「${esc(v.keyword)}」固定触发封禁弹窗（?dsh-keywords=0 可关闭）</p>` : ''}
          ${v.testMode === true ? '<p class="testmode">※ 测试模式已开启（?dsh-ban=1）</p>' : ''}
          ${v.latched === true && v.forced !== true ? `<p class="latched">※ 历史警报：最近 ${v.historyCount} 次判定中有 ${v.historyAlarm} 次命中过美国用户${v.historyLastAt === null ? '' : `（最近一次 ${esc(v.historyLastAt)}）`}</p>` : ''}
        </div>
      </div>
      <div class="details">
        <div class="details-head">
          <strong>判定依据 · ${v.forced === true ? `关键词规则「${esc(v.keyword)}」强制触发` : '贝叶斯对数几率'}</strong>
          <span>合计 ${v.total.toFixed(2)} / 判定线 ${threshold.toFixed(2)}　正向 ${v.proSum.toFixed(2)}（${v.proCount} 项）　反向 ${v.conSum.toFixed(2)}（${v.conCount} 项）　折叠 ${v.foldedCount} 项</span>
        </div>
        <div class="gauge"><i style="width:${percent}%"></i></div>
        <div class="meta">
          <span>账户编号：<b>${esc(account)}</b></span>
          <span>判定时间：<b>${esc(new Date(v.at).toLocaleString('zh-CN'))}</b></span>
          <span>主机报告：<b>${v.hostError === null ? esc(v.hostAt === null ? '未读取' : new Date(v.hostAt).toLocaleString('zh-CN')) : esc(v.hostError)}</b></span>
          <span>模型：<b>${esc(v.model)}</b></span>
        </div>
        <ul class="rows">${rows}</ul>
        <p class="prank">※ <strong>●</strong> 正向证据　<strong>◆</strong> 反向证据（指向非美国）　<strong>▪</strong> 与同组共因、已折叠不重复计分。
          本弹窗是<strong>假的恶搞</strong>：只在本机读取系统语言、时区、输入法、已装软件、网络路由等信息，
          不联网（除非显式开启 IP 比对）、不上传、不修改任何账户状态。按任意键关闭。</p>
      </div>
      <div class="bar">
        <button type="button" class="ghost" data-details>${detailsOpen ? '收起判定依据' : '查看判定依据'}</button>
        <button type="button" data-close>知道了</button>
        <span class="hint">按<b>任意键</b>或点击空白处关闭</span>
      </div>`

    card.querySelector('[data-details]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      detailsOpen = !detailsOpen
      render()
    })
    card.querySelector('[data-close]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      close()
    })
  }

  let mounted = false

  const close = () => {
    if (!open) return
    open = false
    wrap.classList.remove('in')
    window.setTimeout(() => { host.style.display = 'none' }, 150)
    if (typeof document.activeElement?.blur === 'function') document.activeElement.blur()
  }

  const show = () => {
    // Mount once: re-appending on every trigger would duplicate the node.
    if (!mounted) {
      document.body.append(host)
      mounted = true
    }
    host.style.display = 'block'
    // Force a frame so the opening transition runs.
    void wrap.offsetWidth
    open = true
    wrap.classList.add('in')
  }

  const onBackdrop = (event) => { if (event.target === wrap) close() }
  wrap.addEventListener('click', onBackdrop)

  render()
  show()

  return {
    isOpen: () => open,
    open: () => { if (!open) show() },
    close,
    toggle: () => { if (open) close(); else show() },
    setVerdict: (next) => { current = next; render() },
    /** Whether the scorecard is expanded. */
    detailsOpen: () => detailsOpen,
    /** Expand or collapse the scorecard. */
    setDetails: (value) => { detailsOpen = value === undefined ? !detailsOpen : value === true; render() },
    destroy: () => { wrap.removeEventListener('click', onBackdrop); host.remove() },
  }
}
