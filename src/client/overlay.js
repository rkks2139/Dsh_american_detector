/**
 * The fake ban dialog.
 *
 * Deliberately looks like a platform enforcement notice, but it is inert:
 * it renders into its own shadow root, dismisses on any key or click, blocks
 * the page only while open, and carries its own "this is a prank" footer.
 */

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; inset: 0; z-index: 2147483600;
  display: flex; align-items: center; justify-content: center;
  background: var(--dsh-overlay-backdrop, rgba(6, 9, 18, 0.62));
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  font-family: var(--dsh-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  color: var(--dsh-color-text, #e8ecf4);
  opacity: 0; transform: scale(0.985);
  transition: opacity 140ms ease, transform 140ms ease;
}
.wrap.in { opacity: 1; transform: scale(1); }
.card {
  width: min(560px, calc(100vw - 40px));
  max-height: min(84vh, 760px); overflow: auto;
  box-sizing: border-box; padding: 24px 26px 18px;
  border-radius: 16px;
  background: var(--dsh-color-surface, #161a24);
  border: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.12));
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 60, 60, 0.18) inset;
}
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 11px; border-radius: 999px;
  background: rgba(235, 64, 64, 0.14);
  border: 1px solid rgba(235, 64, 64, 0.42);
  color: #ff6b6b; font-size: 12px; font-weight: 700; letter-spacing: .08em;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ff4d4f; box-shadow: 0 0 0 4px rgba(255, 77, 79, 0.18); }
h1 { margin: 16px 0 4px; font-size: 27px; line-height: 1.25; font-weight: 800; letter-spacing: .01em; }
h2 { margin: 0 0 14px; font-size: 13px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: #ff8080; }
p { margin: 0 0 10px; font-size: 13.5px; line-height: 1.65; color: var(--dsh-color-text-secondary, #b9c2d4); }
code { font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; }
.meta {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px 16px;
  margin: 14px 0 16px; padding: 12px 14px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.035); border: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.08));
  font-size: 12px; color: var(--dsh-color-text-secondary, #aab3c6);
}
.meta b { color: var(--dsh-color-text, #e8ecf4); font-weight: 600; }
.score-head { display: flex; align-items: baseline; justify-content: space-between; margin: 4px 0 8px; gap: 12px; flex-wrap: wrap; }
.score-head strong { font-size: 13px; }
.score-head span { font-size: 12px; color: var(--dsh-color-text-secondary, #aab3c6); }
.gauge { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.09); overflow: hidden; margin-bottom: 14px; }
.gauge i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ff9f43, #ff4d4f); }
ul.rows { list-style: none; margin: 0 0 16px; padding: 0; }
ul.rows li {
  display: grid; grid-template-columns: 16px 1fr auto; gap: 10px; align-items: start;
  padding: 9px 0; border-top: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.07));
  font-size: 12.5px;
}
ul.rows li:first-child { border-top: 0; }
.tick { color: #ff5c5c; font-weight: 700; }
.tick.off { color: #4b5468; }
.row-why { display: block; margin-top: 3px; color: var(--dsh-color-text-secondary, #98a2b8); font-size: 11.5px; line-height: 1.5; word-break: break-word; }
.row-num { font-variant-numeric: tabular-nums; font-size: 11.5px; color: #ff9f9f; padding-top: 2px; }
.row-num.off { color: #4b5468; }
.testmode { margin: 0 0 10px; font-size: 11.5px; color: #ffb454; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid var(--dsh-color-border, rgba(255, 255, 255, 0.09)); }
.hint { font-size: 11.5px; color: var(--dsh-color-text-secondary, #98a2b8); }
button {
  font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  padding: 8px 16px; border-radius: 9px; color: #fff;
  background: #d93a3a; border: 1px solid #e45555;
}
button:hover { background: #c73333; }
.prank { margin-top: 10px; font-size: 11px; color: var(--dsh-color-text-secondary, #858ea3); line-height: 1.6; }
`

/**
 * Render the dialog once and return its control face.
 * @param verdict - the fused verdict to display.
 * @returns { open, close, toggle, isOpen, setVerdict, destroy }.
 */
export function createBanOverlay(verdict) {
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

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

  const render = () => {
    const v = current
    const shown = v.signals.filter(signal => signal.informational !== true)
    const rows = shown.map(signal => `
      <li>
        <span class="tick ${signal.hit ? '' : 'off'}">${signal.hit ? '●' : '○'}</span>
        <span><b>${esc(signal.label)}</b>：${esc(signal.value)}
          <span class="row-why">${esc(signal.note)}</span>
        </span>
        <span class="row-num ${signal.hit ? '' : 'off'}">${signal.hit ? `+${signal.weight}` : '0'}</span>
      </li>`).join('')

    const percent = Math.max(4, Math.min(100, Math.round((v.score / Math.max(v.threshold, 1)) * 100)))
    const account = `DSH-${String(Math.abs(hash(v.ua + v.at)) % 900000 + 100000)}`
    card.innerHTML = `
      <span class="badge"><span class="dot"></span>ACCOUNT ENFORCEMENT NOTICE</span>
      <h1>您的账户已被封禁</h1>
      <h2>Your account has been suspended</h2>
      <p>系统检测到本机使用者为<strong>美国用户</strong>，依据《区域可用性政策》第 4.2 条，
         该账户自即时起被永久封禁，历史会话、任务与额度不予退还。</p>
      <div class="meta">
        <span>账户编号：<b>${esc(account)}</b></span>
        <span>判定分：<b>${v.score} / ${v.threshold}</b></span>
        <span>命中信号：<b>${v.hitCount} / ${v.total}</b></span>
        <span>判定时间：<b>${esc(new Date(v.at).toLocaleString('zh-CN'))}</b></span>
      </div>
      <div class="score-head">
        <strong>判定依据（${v.hardHits.length > 0 ? `硬性规则命中：${esc(v.hardHits.join('、'))}` : '加权累计得分'}）</strong>
        <span>美国用户判定线：${v.threshold} 分</span>
      </div>
      ${v.testMode === true ? '<p class="testmode">※ 测试模式已开启（?dsh-ban=1）：无论得分多少都会弹窗。</p>' : ''}
      <div class="gauge"><i style="width:${percent}%"></i></div>
      <ul class="rows">${rows}</ul>
      <footer>
        <span class="hint">按<b>任意键</b>或点击空白处关闭此窗口</span>
        <button type="button" data-close>知道了</button>
      </footer>
      <p class="prank">※ 这是一条<strong>假的恶搞弹窗</strong>：本插件只在本机读取系统语言、时区、已装软件、
        网络代理等信息用于自娱自乐，不联网、不上传、不修改任何账户状态，也没有真的封禁你。
        关闭后一切照常。</p>`
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

  render()
  show()

  const onClick = (event) => {
    const target = event.target
    if (target instanceof Element && target.closest('[data-close]') !== null) {
      event.preventDefault()
      close()
    }
  }
  root.addEventListener('click', onClick)
  const onBackdrop = (event) => { if (event.target === wrap) close() }
  wrap.addEventListener('click', onBackdrop)

  return {
    isOpen: () => open,
    open: () => { if (!open) show() },
    close,
    toggle: () => { if (open) close(); else show() },
    setVerdict: (next) => { current = next; render() },
    destroy: () => { root.removeEventListener('click', onClick); wrap.removeEventListener('click', onBackdrop); host.remove() },
  }
}

/** Stable small hash for the fake account number. */
function hash(text) {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value | 0
}
