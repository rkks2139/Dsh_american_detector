window.__ModuleLoader__.load({
  id: "dsh-american-detector",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const __mod = {};
    // ---- src/client/browser-signals.js ----
    __mod["src/client/browser-signals.js"] = (() => {
      /**
       * Browser-side "are you American?" signals.
       *
       * These are the checks only a page can make: the browser UI language, the
       * IANA time zone, the user-agent engine, the browser vendor, and the content
       * language the page actually renders in. The host half contributes the
       * filesystem, software, network and OS signals.
       */
      
      /** US mainland IANA zones, plus a couple of common satellites. */
      const US_TIMEZONE = /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Indiana|Kentucky|Boise|Juneau|Sitka|Adak|Nome|Honolulu|Menominee|North_Dakota|Puerto_Rico|Virgin|St_Thomas)|Pacific\/(Honolulu|Guam|Pago_Pago))$/
      
      /** Time zones an American expat typically keeps while living elsewhere. */
      const EXPAT_TIMEZONE = /^(America\/|US\/|Pacific\/Honolulu|Pacific\/Guam)/
      
      /** An IP-agnostic "the browser is pinned to America" heuristic. */
      const US_LOCALE = /^(en[-_]US|en[-_]CA|en[-_]PR|es[-_]US)$/i
      const ENGLISH_LOCALE = /^en([-_]|$)/i
      
      /** Browsers whose developer's principal operator is an American company. */
      const US_BROWSERS = [
        { name: 'Google Chrome', company: 'Google（美国）', match: /Chrome\// },
        { name: 'Microsoft Edge', company: 'Microsoft（美国）', match: /Edg[A-Z]?\// },
        { name: 'Safari', company: 'Apple（美国）', match: /Safari\// },
        { name: 'Arc', company: 'The Browser Company（美国）', match: /Arc\// },
        { name: 'Firefox', company: 'Mozilla（美国）', match: /Firefox\// },
        { name: 'ChatGPT Atlas', company: 'OpenAI（美国）', match: /Atlas\// },
      ]
      
      /** Browsers that are not American-operated (kept for the scorecard's balance). */
      const NON_US_BROWSERS = [
        { name: 'QQ 浏览器', company: '腾讯（中国）', match: /QQBrowser/i },
        { name: 'UC 浏览器', company: '阿里（中国）', match: /UCBrowser/i },
        { name: '360 浏览器', company: '奇虎360（中国）', match: /360SE|360EE|QihooBrowser/i },
        { name: '搜狗浏览器', company: '搜狗（中国）', match: /MetaSr|Sogou/i },
        { name: 'Yandex', company: 'Yandex（俄罗斯）', match: /YaBrowser/i },
        { name: 'Vivaldi', company: 'Vivaldi（挪威）', match: /Vivaldi/i },
        { name: 'Brave', company: 'Brave（美国）', match: /Brave\// },
      ]
      
      /** Read a string property defensively. */
      function safe(read) {
        try {
          return read()
        } catch {
          return ''
        }
      }
      
      /** Every navigator.language entry, de-duplicated. */
      function navigatorLanguages() {
        const list = Array.isArray(navigator.languages) ? navigator.languages.slice() : []
        if (navigator.language !== undefined) list.push(navigator.language)
        return [...new Set(list.filter(value => typeof value === 'string' && value !== ''))]
      }
      
      /** Signals this page can derive on its own. */
       function browserSignals() {
        const ua = safe(() => navigator.userAgent)
        const languages = navigatorLanguages()
        const primary = languages[0] ?? ''
        const timeZone = safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || 'unknown'
        const offsetHours = -new Date().getTimezoneOffset() / 60
        const pageLanguage = safe(() => document.documentElement.lang)
        const chip = safe(() => navigator.userAgentData?.platform) || ''
        const platformHint = safe(() => navigator.platform)
        const touchPoints = Number(safe(() => String(navigator.maxTouchPoints))) || 0
        const isMobile = safe(() => String(/Mobi|Android|iPhone|iPad/i.test(ua))) === 'true'
      
        const otherBrowser = NON_US_BROWSERS.find(entry => entry.match.test(ua))
        const usBrowser = US_BROWSERS.find(entry => entry.match.test(ua))
      
        const signals = []
      
        signals.push({
          id: 'browser-language',
          label: '浏览器语言',
          note: '浏览器语言是否为英文、首选是否为 en-US',
          weight: US_LOCALE.test(primary) ? 22 : ENGLISH_LOCALE.test(primary) ? 16 : 0,
          value: `${primary}${languages.length > 1 ? `（列表：${languages.slice(0, 4).join(', ')}）` : ''}`,
          hit: ENGLISH_LOCALE.test(primary),
          hard: US_LOCALE.test(primary),
        })
      
        signals.push({
          id: 'browser-timezone',
          label: '浏览器时区',
          note: '时区代码是否是美国本土时区（America/New_York … America/Los_Angeles）',
          weight: US_TIMEZONE.test(timeZone) ? 18 : EXPAT_TIMEZONE.test(timeZone) ? 10 : 0,
          value: `${timeZone}（UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}，本地时间 ${new Date().toLocaleString('en-US')}）`,
          hit: US_TIMEZONE.test(timeZone),
          hard: US_TIMEZONE.test(timeZone),
        })
      
        signals.push({
          id: 'browser-12h-clock',
          label: '12 小时制',
          note: '时间格式是否为美国习惯的 12 小时制（AM/PM）',
          weight: /AM|PM/i.test(new Date().toLocaleTimeString('en-US')) ? 4 : 0,
          value: new Date().toLocaleTimeString('en-US'),
          hit: /AM|PM/i.test(new Date().toLocaleTimeString('en-US')),
        })
      
        signals.push({
          id: 'browser-vendor',
          label: '浏览器出品方',
          note: '浏览器是不是美国人开发的（Chrome / Arc / Safari / Edge / Firefox …）',
          weight: usBrowser === undefined ? 0 : /Chrome|Arc|Edge/.test(usBrowser.name) ? 14 : 10,
          value: usBrowser !== undefined
            ? `${usBrowser.name} — ${usBrowser.company}`
            : (otherBrowser === undefined ? '未能识别内核' : `${otherBrowser.name} — ${otherBrowser.company}（非美国主体，不计分）`),
          hit: usBrowser !== undefined,
        })
      
        signals.push({
          id: 'page-language',
          label: '页面语言',
          note: '界面是否以英文渲染（document.lang）',
          weight: ENGLISH_LOCALE.test(pageLanguage) ? 8 : 0,
          value: pageLanguage === '' ? '未声明' : pageLanguage,
          hit: ENGLISH_LOCALE.test(pageLanguage),
        })
      
        signals.push({
          id: 'browser-platform',
          label: '浏览器上报的系统',
          note: 'UA 上报的平台是否伪装或错位（与主机结果比对）',
          weight: 0,
          value: [platformHint !== '' ? `navigator.platform=${platformHint}` : '', chip !== '' ? `UA-CH 平台=${chip}` : '',
            `触点数=${touchPoints}`, isMobile ? '移动端' : '桌面端'].filter(Boolean).join('；'),
          hit: false,
          informational: true,
        })
      
        return { signals, ua, languages, timeZone }
      }
      return { browserSignals };
    })();
    
    // ---- src/client/verdict.js ----
    __mod["src/client/verdict.js"] = (() => {
      /**
       * The verdict: fuse the browser-side and host-side signals into one
       * "is this an American user?" decision, with a legible scorecard.
       *
       * Hard rules mirror the brief: an English system language, an English browser,
       * a US time zone, or a US-browser fingerprint each decide the case alone.
       * Everything else accumulates score against a threshold.
       */
      
      /** Score at or above which the account gets "banned". */
       const THRESHOLD = 60
      
      /**
       * Fuse every signal into a verdict.
       * @param browserSignals - rows from browserSignals().
       * @param hostReport - the host report, or null when the route was unreachable.
       * @param options - { lock, threshold, disabled } overrides.
       * @returns the verdict: signals, score, reasons, hard rules and the boolean.
       */
       function verdictOf(browserSignals, hostReport, options = {}) {
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
      return { THRESHOLD, verdictOf };
    })();
    
    // ---- src/client/overlay.js ----
    __mod["src/client/overlay.js"] = (() => {
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
       function createBanOverlay(verdict) {
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
      return { createBanOverlay };
    })();
    
    // ---- src/client/index.js ----
    __mod["src/client/index.js"] = (() => {
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
      let { browserSignals } = __mod["src/client/browser-signals.js"];
      let { verdictOf } = __mod["src/client/verdict.js"];
      let { createBanOverlay } = __mod["src/client/overlay.js"];
      /** Client plugin name, matching this package's id in the boot graph. */
       const name = 'dsh-american-detector'
      
      /** Both services exist in the shipped Web composition. */
       const inject = ['sessions', 'slots']
      
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
       function apply(ctx) {
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
       const default_ = { name, inject, apply }
      return { default_, name, inject, apply };
    })();
    const entry = __mod["src/client/index.js"];
    exports.name = entry.name;
    exports.inject = entry.inject;
    exports.apply = entry.apply;
    exports.default = { name: entry.name, inject: entry.inject, apply: entry.apply };
    return module.exports;
  },
});
