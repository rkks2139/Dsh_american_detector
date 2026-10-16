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
       * These are the checks only a page can make: the browser UI language order, the
       * IANA time zone it reports, the engine/vendor, the language the page actually
       * renders in, and — importantly — whether the browser's own locale agrees with
       * the host report. Each row carries a log-odds `logit` (positive toward
       * American) and a `group`; see src/client/score.js.
       */
      
      /** US mainland IANA zones, plus the common satellites. */
      const US_TIMEZONE = /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Indiana|Kentucky|Boise|Juneau|Sitka|Adak|Nome|Honolulu|Menominee|North_Dakota|Puerto_Rico|Virgin|St_Thomas)|Pacific\/(Honolulu|Guam|Pago_Pago))$/
      
      /** Zones that are neither US nor Chinese, for the coherence check. */
      const CN_TIMEZONE = /^Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Macau|Hong_Kong|Taipei)$/
      
      /** Locale tags that mean "this browser is pinned to America". */
      const US_LOCALE = /^(en[-_]US|en[-_]PR|es[-_]US)$/i
      const ENGLISH_LOCALE = /^en([-_]|$)/i
      const CHINESE_LOCALE = /^zh([-_]|$)/i
      
      /** Browsers whose developer's principal operator is an American company. */
      const US_BROWSERS = [
        { name: 'Google Chrome', company: 'Google（美国）', group: 'browser-vendor', logit: 0.5, match: /Chrome\// },
        { name: 'Microsoft Edge', company: 'Microsoft（美国）', group: 'browser-vendor', logit: 0.5, match: /Edg[A-Z]?\// },
        { name: 'ChatGPT Atlas', company: 'OpenAI（美国）', group: 'browser-vendor', logit: 0.6, match: /Atlas\// },
        { name: 'Arc', company: 'The Browser Company（美国）', group: 'browser-vendor', logit: 0.6, match: /Arc\// },
        { name: 'Brave', company: 'Brave（美国）', group: 'browser-vendor', logit: 0.5, match: /Brave\// },
        { name: 'Firefox', company: 'Mozilla（美国）', group: 'browser-vendor', logit: 0.5, match: /Firefox\// },
        { name: 'Safari', company: 'Apple（美国）', group: 'browser-vendor', logit: 0.5, match: /Version\/[\d.]+ Safari\// },
      ]
      
      /** Browsers from non-American vendors (recorded, negative evidence). */
      const OTHER_BROWSERS = [
        { name: 'QQ 浏览器', company: '腾讯（中国）', match: /QQBrowser/i },
        { name: 'UC 浏览器', company: '阿里（中国）', match: /UCBrowser/i },
        { name: '360 浏览器', company: '奇虎360（中国）', match: /360SE|360EE|QihooBrowser/i },
        { name: '搜狗浏览器', company: '搜狗（中国）', match: /MetaSr|Sogou/i },
        { name: 'Yandex', company: 'Yandex（俄罗斯）', match: /YaBrowser/i },
        { name: 'Vivaldi', company: 'Vivaldi（挪威）', match: /Vivaldi/i },
      ]
      
      /** Read a string property defensively. */
      function safe(read) {
        try {
          return read()
        } catch {
          return ''
        }
      }
      
      /** Every navigator.language entry, de-duplicated, primary first. */
      function navigatorLanguages() {
        const list = Array.isArray(navigator.languages) ? navigator.languages.slice() : []
        if (navigator.language !== undefined) list.push(navigator.language)
        return [...new Set(list.filter(value => typeof value === 'string' && value !== ''))]
      }
      
      /** Split a tag like zh-Hans-CN into language and region. */
      function parseTag(tag) {
        const parts = String(tag ?? '').replaceAll('_', '-').split('-').filter(Boolean)
        return {
          language: (parts[0] ?? '').toLowerCase(),
          region: (parts.find((part, index) => index > 0 && part.length === 2) ?? '').toUpperCase(),
        }
      }
      
      /**
       * Collect this page's signals.
       * @param hostReport - the host report, or null when the route was unreachable.
       * @returns { signals, ua, languages, timeZone, primary, region }
       */
       function browserSignals(hostReport = null) {
        const ua = safe(() => navigator.userAgent)
        const languages = navigatorLanguages()
        const primaryTag = languages[0] ?? ''
        const primary = parseTag(primaryTag)
        const timeZone = safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || ''
        const offsetHours = -new Date().getTimezoneOffset() / 60
        const pageLanguage = safe(() => document.documentElement.lang)
        const twelveHour = /AM|PM/i.test(safe(() => new Date().toLocaleTimeString('en-US')))
        const usBrowser = US_BROWSERS.find(entry => entry.match.test(ua))
        const otherBrowser = usBrowser === undefined ? OTHER_BROWSERS.find(entry => entry.match.test(ua)) : undefined
        const hostFacts = hostReport?.facts ?? null
      
        const signals = []
      
        /* ---- dimension: the browser's UI language --------------------------- */
        const languageLogit = US_LOCALE.test(primaryTag) ? 1.3 : ENGLISH_LOCALE.test(primaryTag) ? 0.9 : CHINESE_LOCALE.test(primaryTag) ? -1.2 : 0
        signals.push({
          id: 'browser-language',
          label: '浏览器语言',
          note: '浏览器首选语言：en-US 是很强的正向证据，zh 是很强的反向证据',
          group: 'ui-language',
          logit: languageLogit,
          value: `${primaryTag}${languages.length > 1 ? `（列表：${languages.slice(0, 4).join(', ')}）` : ''}`,
          hard: US_LOCALE.test(primaryTag),
          extra: { languages, primary, region: primary.region },
        })
      
        /* ---- dimension: the browser's time zone ----------------------------- */
        const zoneLogit = US_TIMEZONE.test(timeZone) ? 0.7 : CN_TIMEZONE.test(timeZone) ? -0.4 : 0
        signals.push({
          id: 'browser-timezone',
          label: '浏览器时区',
          note: '浏览器上报的时区代码是否是美国本土时区',
          group: 'geo-identity',
          logit: zoneLogit,
          value: `${timeZone || 'unknown'}（UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}）`,
          hard: false,
          extra: { timeZone, offsetHours },
        })
      
        /* ---- dimension: time format (a weak corroborator) ------------------- */
        signals.push({
          id: 'browser-12h-clock',
          label: '时间格式',
          note: '12 小时制只是弱旁证，和语言强相关',
          group: 'ui-language',
          logit: twelveHour && ENGLISH_LOCALE.test(primaryTag) ? 0.2 : 0,
          value: twelveHour ? '12 小时制（AM/PM）' : '24 小时制',
          extra: {},
        })
      
        /* ---- dimension: browser vendor -------------------------------------- */
        signals.push({
          id: 'browser-vendor',
          label: '浏览器出品方',
          note: '浏览器是不是美国人开发的（Chrome / Arc / Safari / Edge / Firefox…）',
          group: 'browser-vendor',
          logit: usBrowser?.logit ?? (otherBrowser !== undefined ? -0.5 : 0),
          value: usBrowser !== undefined
            ? `${usBrowser.name} — ${usBrowser.company}`
            : otherBrowser !== undefined ? `${otherBrowser.name} — ${otherBrowser.company}` : '未能识别内核',
          extra: {},
        })
      
        /* ---- dimension: the language the page actually renders -------------- */
        signals.push({
          id: 'page-language',
          label: '页面语言',
          note: '界面是否以英文渲染（document.lang）',
          group: 'ui-language',
          logit: ENGLISH_LOCALE.test(pageLanguage) ? 0.4 : CHINESE_LOCALE.test(pageLanguage) ? -0.4 : 0,
          value: pageLanguage === '' ? '未声明' : pageLanguage,
          extra: {},
        })
      
        /* ---- dimension: browser vs host agreement --------------------------- */
        if (hostFacts !== null) {
          const hostZone = hostFacts?.zone?.zone ?? ''
          const hostRegion = hostFacts?.locale?.primary?.region ?? ''
          const hostLanguage = hostFacts?.locale?.primary?.language ?? ''
          const zoneDisagrees = timeZone !== '' && hostZone !== '' && timeZone !== hostZone
          const regionDisagrees = primary.region !== '' && hostRegion !== '' && primary.region !== hostRegion
          const languageDisagrees = primary.language !== '' && hostLanguage !== '' && primary.language !== hostLanguage
          const disagreements = [zoneDisagrees, regionDisagrees, languageDisagrees].filter(Boolean).length
          // A browser that contradicts its own host is the signature of a locale or
          // zone override, which is exactly the behaviour this detector exists for.
          const logit = disagreements >= 2 ? 0.9 : disagreements === 1 ? 0.3 : 0
          signals.push({
            id: 'browser-host-agreement',
            label: '浏览器与主机是否自洽',
            note: '浏览器语言/时区与主机报告是否矛盾：矛盾是区域或时区覆盖的特征',
            group: 'browser-host',
            logit,
            value: disagreements === 0
              ? `一致（时区 ${timeZone || '?'} / 区域 ${primary.region || '?'}）`
              : [
                zoneDisagrees ? `时区 ${timeZone} ≠ 主机 ${hostZone}` : '',
                regionDisagrees ? `区域 ${primary.region} ≠ 主机 ${hostRegion}` : '',
                languageDisagrees ? `语言 ${primary.language} ≠ 主机 ${hostLanguage}` : '',
              ].filter(Boolean).join('；'),
            extra: { disagreements },
          })
        }
      
        /* ---- dimension: cross-source coherence (the decisive term) ---------- *
         * Only this side can compute it: the browser time zone and UI language live
         * here, and the host report carries the OS sides as plain facts. Agreement
         * across independent sources is strong evidence; a machine whose clock points
         * at America while its region and input methods say Chinese is the signature
         * of a deliberate override, which is what this detector is for.
         */
        {
          const hostSides = Array.isArray(hostFacts?.sides) ? hostFacts.sides : []
          const sideOfZone = zone => (zone === '' ? 'unknown'
            : zone.startsWith('America/') || zone.startsWith('Pacific/Honolulu') ? 'us'
              : /^Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Macau|Hong_Kong|Taipei)$/.test(zone) ? 'cn' : 'other')
          const sideOfRegion = (language, region) => (region === 'US' ? 'us'
            : region === 'CN' || region === 'HK' || region === 'TW' || region === 'MO' ? 'cn'
              : language === 'zh' ? 'cn' : region === '' && language === '' ? 'unknown' : 'other')
          const ipSide = hostFacts?.ip?.country === '' || hostFacts?.ip?.country === undefined
            ? 'unknown'
            : hostFacts?.ip?.country === 'US' ? 'us' : hostFacts?.ip?.country === 'CN' ? 'cn' : 'other'
      
          const sides = [
            { name: '浏览器时区', side: sideOfZone(timeZone), value: timeZone },
            { name: '浏览器语言', side: sideOfRegion(primary.language, primary.region), value: primaryTag },
            ...(hostSides.map(entry => ({
              name: { 'host-timezone': '主机时区', 'host-locale': '系统区域', 'input-method': '输入法', ip: 'IP 属地' }[entry.name] ?? entry.name,
              side: entry.side,
              value: entry.value,
            }))),
            ...(ipSide === 'unknown' ? [] : [{ name: 'IP 属地', side: ipSide, value: hostFacts?.ip?.country ?? '' }]),
          ].filter(entry => entry.side !== 'unknown')
      
          const usSides = sides.filter(entry => entry.side === 'us')
          const cnSides = sides.filter(entry => entry.side === 'cn')
          const zoneIsUs = sideOfZone(timeZone) === 'us'
          const zoneIsCn = sideOfZone(timeZone) === 'cn'
          const parentRegion = sideOfRegion(hostFacts?.locale?.primary?.language ?? '', hostFacts?.locale?.primary?.region ?? '')
          const hasCjkInput = hostSides.some(entry => entry.name === 'input-method' && entry.side === 'cn')
          const spoofSignature = (zoneIsUs && (hostFacts?.locale?.primary?.language === 'zh' || hasCjkInput))
            || (zoneIsCn && hostFacts?.locale?.primary?.region === 'US')
          // A browser whose language and zone both say America, with no host side to
          // corroborate or contradict, is a *weak* but real reading: two independent
          // browser-level facts agree. Without this arm the detector could never
          // decide in a composition that has no host report at all.
          const browserOnlyClaim = usSides.length >= 2 && cnSides.length === 0 && hostSides.length === 0
      
          const label = { us: '美国', cn: '中国', other: '其他', unknown: '未知' }
          const describe = sides.map(entry => `${entry.name}=${label[entry.side]}${entry.value === '' ? '' : `(${entry.value})`}`).join('；')
      
          let logit = 0
          let note = '来源不足或不一致，无定论'
          let informational = true
          let hard = false
          if (usSides.length > 0 && cnSides.length === 0 && sides.length >= 3) {
            logit = 2.0
            note = '多个独立来源（浏览器、主机、输入法、IP）全部指向美国'
            informational = false
            hard = true
          } else if (browserOnlyClaim) {
            logit = 0.8
            note = '浏览器语言与浏览器时区同时指向美国；主机侧没有可比来源，故只给中等权重'
            informational = false
          } else if (spoofSignature) {
            logit = 1.8
            note = '一部分来源指向美国、一部分指向中文圈：典型的时钟/区域覆盖特征'
            informational = false
          } else if (usSides.length > 0 && cnSides.length > 0) {
            logit = 1.0
            note = '部分来源指向美国、部分指向中国'
            informational = false
          } else if (cnSides.length >= 2 && usSides.length === 0) {
            logit = -1.5
            note = '多个独立来源一致指向中国或中文圈，是对"美国用户"的强反证'
            informational = false
          }
      
          signals.push({
            id: 'coherence',
            label: spoofSignature ? '跨源一致性（伪造特征）' : '跨源一致性',
            note,
            group: 'geo-identity',
            logit,
            informational,
            hard,
            value: describe,
            extra: { sides, spoofSignature, usSides: usSides.length, cnSides: cnSides.length },
          })
        }
      
        /* ---- informational: what the UA claims about the platform ----------- */
        signals.push({
          id: 'browser-platform',
          label: '浏览器上报的系统',
          note: 'UA 上报的平台，仅记录，不参与计分',
          group: 'meta',
          logit: 0,
          informational: true,
          value: [
            safe(() => navigator.platform) !== '' ? `navigator.platform=${safe(() => navigator.platform)}` : '',
            safe(() => navigator.userAgentData?.platform) !== '' ? `UA-CH 平台=${safe(() => navigator.userAgentData?.platform)}` : '',
            `触点数=${Number(safe(() => String(navigator.maxTouchPoints))) || 0}`,
          ].filter(Boolean).join('；'),
          extra: {},
        })
      
        return { signals, ua, languages, timeZone, primary, region: primary.region }
      }
      return { browserSignals };
    })();
    
    // ---- src/client/score.js ----
    __mod["src/client/score.js"] = (() => {
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
       const THRESHOLD_LOGIT = 2.2
      
      /** The model version stamped into the verdict and the stored history. */
       const MODEL = 'v2'
      
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
       function normalizeSignal(signal) {
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
       function collapseGroups(signals) {
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
       function scoreSignals(signals, options = {}) {
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
       function rowIsAmerican(row) {
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
       function replayHistory(history) {
        const american = history.filter(rowIsAmerican)
        return {
          latched: american.length > 0,
          count: american.length,
          last: american[american.length - 1] ?? null,
        }
      }
      return { THRESHOLD_LOGIT, MODEL, normalizeSignal, collapseGroups, scoreSignals, rowIsAmerican, replayHistory };
    })();
    
    // ---- src/client/overlay.js ----
    __mod["src/client/overlay.js"] = (() => {
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
       function createBanOverlay(verdict, options = {}) {
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
      return { createBanOverlay };
    })();
    
    // ---- src/client/gate.js ----
    __mod["src/client/gate.js"] = (() => {
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
       const GATE_PHRASE = '中国人能飞'
      
      /** Accepted transcriptions of the phrase (Simplified Chinese only). */
      const PHRASE_FORMS = new Set([GATE_PHRASE])
      
      /** How many lines the user must transcribe. */
       const PHRASE_REPEATS = 3
      
      /** The fake reCAPTCHA hold, in milliseconds. */
       const CAPTCHA_HOLD_MS = 10_000
      
      /** Instructions between gates, chosen per cycle from this range. */
       const DEFAULT_EVERY_MIN = 4
       const DEFAULT_EVERY_MAX = 5
      
      /** Read the persisted counter + pending challenge. */
       function readGateState() {
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
       function saveGateState(state) {
        try {
          window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
        } catch {
          /* storage unavailable: the gate still works for this page */
        }
      }
      
      /** Drop the counter and any pending challenge. */
       function clearGateState() {
        try {
          window.localStorage.removeItem(STATE_KEY)
        } catch {
          /* nothing to clear */
        }
      }
      
      /** Draw the next gate interval: 4 or 5 instructions. */
       function pickNext() {
        const span = DEFAULT_EVERY_MAX - DEFAULT_EVERY_MIN + 1
        return DEFAULT_EVERY_MIN + Math.floor(Math.random() * span)
      }
      
      /**
       * Advance the counter for one instruction that is actually going through.
       * @param state - state from {@link readGateState}.
       * @param force - force the gate open regardless of the counter.
       * @returns { state, trigger } — the saved state and whether to raise the gate.
       */
       function advanceGate(state, force = false) {
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
       function passGate(state) {
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
       function markGatePending(state) {
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
       function normalizePhrase(value) {
        return String(value ?? '')
          .replace(/[\s\u3000]/gu, '')
          .replace(/[，,。.、！!？?；;：:""''"'（）()《》〈〉【】\[\]—\-_~·]/gu, '')
      }
      
      /** Whether a transcription is one acceptable occurrence of the phrase. */
       function phraseAccepted(value) {
        return PHRASE_FORMS.has(normalizePhrase(value))
      }
      return { GATE_PHRASE, PHRASE_REPEATS, CAPTCHA_HOLD_MS, DEFAULT_EVERY_MIN, DEFAULT_EVERY_MAX, readGateState, saveGateState, clearGateState, pickNext, advanceGate, passGate, markGatePending, normalizePhrase, phraseAccepted };
    })();
    
    // ---- src/client/gate-overlay.js ----
    __mod["src/client/gate-overlay.js"] = (() => {
      /**
       * The blue "账户登录验证" dialog.
       *
       * Deliberately styled like a platform re-authentication step — blue, calm, and
       * official-looking — but it is inert browser theatre: three transcriptions of
       * 中国人能飞 plus a ten-second reCAPTCHA hold, and the page is yours again. No
       * credential, cookie, or account is ever touched, and the dialog says so.
       *
       * It blocks dismissal on purpose (Esc, clicking away, stray keys) because the
       * joke is the forced ceremony; the only way past is to do the ceremony.
       */
      let { CAPTCHA_HOLD_MS, GATE_PHRASE, PHRASE_REPEATS, phraseAccepted } = __mod["src/client/gate.js"];
      const STYLE = `
      :host { all: initial; }
      .wrap {
        position: fixed; inset: 0; z-index: 2147483650;
        display: flex; align-items: stretch; justify-content: center;
        box-sizing: border-box; padding: clamp(12px, 3vh, 34px);
        background: var(--dsh-overlay-backdrop, rgba(6, 9, 18, 0.74));
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        font-family: var(--dsh-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
        color: var(--dsh-color-text, #e8ecf4);
        opacity: 0; transform: scale(0.985);
        transition: opacity 160ms ease, transform 160ms ease;
      }
      .wrap.in { opacity: 1; transform: scale(1); }
      .card {
        display: flex; flex-direction: column;
        gap: clamp(10px, 1.8vh, 20px);
        width: 100%; height: 100%; max-width: 1240px; box-sizing: border-box;
        padding: clamp(22px, 4.4vh, 52px) clamp(22px, 5vw, 68px);
        border-radius: 20px; overflow: auto;
        background:
          radial-gradient(110% 80% at 50% 0%, rgba(59, 130, 246, 0.16) 0%, transparent 60%),
          linear-gradient(180deg, #14263f 0%, #101d31 58%, #0d1728 100%);
        border: 1px solid rgba(96, 165, 250, 0.42);
        box-shadow: 0 40px 120px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(59, 130, 246, 0.22) inset;
      }
      .head { display: flex; flex-direction: column; gap: 2px; }
      .step { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      .foot { flex: none; }
      .badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 4px 11px; border-radius: 999px;
        background: rgba(59, 130, 246, 0.16);
        border: 1px solid rgba(96, 165, 250, 0.5);
        color: #8ec5ff; font-size: 12px; font-weight: 700; letter-spacing: .08em;
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.22); }
      h1 { margin: 0; font-size: clamp(26px, 4.4vh, 44px); line-height: 1.25; font-weight: 850; }
      h2 { margin: 0; font-size: clamp(11px, 1.4vh, 13px); font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: #7fb3f0; }
      p { margin: 0 0 clamp(8px, 1.4vh, 14px); font-size: clamp(13px, 1.7vh, 15px); line-height: 1.75; color: #b6c7dd; }
      .steps { margin: 0 0 clamp(8px, 1.4vh, 16px); padding: 0; list-style: none; counter-reset: step; }
      .steps li {
        position: relative; counter-increment: step;
        padding: clamp(6px, 1.1vh, 12px) 0 clamp(6px, 1.1vh, 12px) 34px; font-size: clamp(12.5px, 1.65vh, 14.5px); color: #c7d7ea;
        border-top: 1px solid rgba(96, 165, 250, 0.14);
      }
      .steps li:first-child { border-top: 0; }
      .steps li::before {
        content: counter(step);
        position: absolute; left: 0; top: 8px;
        width: 19px; height: 19px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 11px; font-weight: 700; color: #0b1728;
        background: #7fb3f0;
      }
      .steps li.done::before { content: "✓"; background: #5ec8a0; color: #06251a; }
      .steps li.active { color: #ffffff; }
      .panel {
        margin: 0 0 clamp(8px, 1.4vh, 14px); padding: clamp(14px, 2.2vh, 24px) clamp(15px, 2.4vw, 28px); border-radius: 12px;
        background: rgba(8, 18, 33, 0.72); border: 1px solid rgba(96, 165, 250, 0.26);
      }
      .panel.locked { opacity: .55; }
      .step-two { margin: 0; }
      .step-two .captcha { margin-top: clamp(6px, 1vh, 12px); }
      .label { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; font-size: 12.5px; color: #9fb6d0; }
      .label b { color: #eaf2ff; font-weight: 600; }
      .phrase {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        margin-bottom: clamp(8px, 1.4vh, 14px); padding: clamp(10px, 1.8vh, 18px) 14px; border-radius: 10px;
        background: rgba(59, 130, 246, 0.12); border: 1px dashed rgba(96, 165, 250, 0.45);
        font-size: clamp(17px, 2.9vh, 26px); letter-spacing: .16em; color: #dcebff; font-weight: 700;
      }
      .phrase span { font-size: 11px; letter-spacing: 0; color: #8fb0d4; font-weight: 400; }
      .progress { display: flex; gap: 6px; margin-bottom: 10px; }
      .progress i {
        flex: 1; height: 4px; border-radius: 999px; background: rgba(148, 180, 214, 0.22);
      }
      .progress i.on { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
      input {
        width: 100%; box-sizing: border-box; padding: clamp(11px, 1.9vh, 18px) 14px; border-radius: 10px;
        background: rgba(4, 12, 24, 0.85); border: 1px solid rgba(96, 165, 250, 0.4);
        color: #eaf2ff; font: inherit; font-size: clamp(15px, 2.2vh, 20px); letter-spacing: .1em;
        outline: none;
      }
      input:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.22); }
      input:disabled { opacity: .5; }
      .hintline { margin: 8px 0 0; font-size: 11.5px; color: #8fa8c6; min-height: 16px; }
      .hintline.bad { color: #ff9c8a; }
      .hintline.good { color: #7fe0b8; }
      .captcha { display: flex; align-items: center; gap: 12px; }
      .box {
        width: clamp(28px, 4.4vh, 42px); height: clamp(28px, 4.4vh, 42px); flex: none; border-radius: 7px;
        border: 1.5px solid #7fa6cd; background: rgba(235, 244, 255, 0.94);
        display: grid; place-items: center; cursor: pointer;
        font-size: clamp(15px, 2.4vh, 22px); color: #0b1728; font-weight: 800; user-select: none;
      }
      .box.ring { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28); }
      .box.busy { cursor: progress; }
      .box.ring { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28); animation: pulse 1s ease-in-out infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
      .box.ready { cursor: pointer; }
      .box.done { cursor: default; background: #5ec8a0; border-color: #5ec8a0; }
      .captcha .text { flex: 1; font-size: clamp(12.5px, 1.7vh, 15px); color: #c7d7ea; }
      .captcha .text small { display: block; margin-top: 3px; color: #8fa8c6; font-size: 11px; }
      button.primary {
        width: 100%; margin-top: 4px; padding: clamp(12px, 2vh, 18px) 16px; border-radius: 11px;
        font: inherit; font-size: clamp(13.5px, 1.8vh, 16px); font-weight: 700; color: #06131f; cursor: pointer;
        background: linear-gradient(180deg, #8ec5ff, #4f9bff);
        border: 1px solid #a9d3ff;
      }
      button.primary:disabled { cursor: not-allowed; color: #7d8ea3; background: #243449; border-color: #33465e; }
      .prank { margin-top: 12px; font-size: 11px; color: #7f93ab; line-height: 1.6; }
      `
      
      /** The step rows the dialog walks through. */
      const STEPS = [
        { id: 'phrase', text: `连续默写「中国人能飞」三遍（必须简体中文）` },
        { id: 'captcha', text: `完成人机验证（按住 10 秒）` },
      ]
      
      /**
       * Build and show the gate dialog.
       * @param face - { nextAt, lastCount, onPass } control hooks.
       * @returns { isOpen, close, destroy, focus }.
       */
       function createGateOverlay(face = {}) {
        const host = document.createElement('div')
        host.setAttribute('data-dsh-american-detector', 'gate')
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
      
        let done = 0
        let captcha = 'idle'
        let holdTimer = null
        let settled = false
      
        const lines = []
        const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
      
        const render = () => {
          const phraseDone = done >= 3
          const captchaDone = captcha === 'done'
          const rows = STEPS.map((step, index) => {
            const isDone = step.id === 'phrase' ? phraseDone : captchaDone
            const active = !isDone && (step.id === 'phrase' ? true : phraseDone)
            return `<li class="${isDone ? 'done' : active ? 'active' : ''}">${esc(step.text)}</li>`
          }).join('')
      
          card.innerHTML = `
            <div class="head">
              <span class="badge"><span class="dot"></span>SECURITY RE-AUTHENTICATION</span>
              <h1>账户登录验证</h1>
              <h2>Account re-authentication required</h2>
              <p>为继续使用本站，请完成本次身份核验。每 ${esc(face.nextAt ?? 4)} 轮对话触发一次，未通过前输入框保持锁定。</p>
              <ul class="steps">${rows}</ul>
            </div>
            <div class="step step-one">
            <div class="panel ${phraseDone ? '' : ''}">
              <div class="label"><b>步骤一 · 默写口令</b><span>已完成 ${done} / ${PHRASE_REPEATS}</span></div>
              <div class="phrase">${esc(GATE_PHRASE)} <span>请逐字默写，必须简体中文</span></div>
              <div class="progress">${Array.from({ length: PHRASE_REPEATS }, (_, index) => `<i class="${index < done ? 'on' : ''}"></i>`).join('')}</div>
              <input type="text" autocomplete="off" spellcheck="false" maxlength="24"
                placeholder="${phraseDone ? '已通过' : '在此输入口令，按回车提交'}"
                ${phraseDone ? 'disabled' : ''} />
              <p class="hintline" data-hint>${phraseDone ? '口令校验通过。' : '提示：不需要加标点，连续输入即可。'}</p>
            </div>
            </div>
            <div class="step step-two panel ${phraseDone && !captchaDone ? '' : 'locked'}">
              <div class="label"><b>步骤二 · 人机验证</b><span>reCAPTCHA v9</span></div>
              <div class="captcha">
                <div class="box ${captcha === 'idle' ? 'ready' : ''} ${captcha === 'hold' ? 'ring busy' : ''} ${captcha === 'done' ? 'done' : ''}"
                  data-box>
                  ${captcha === 'idle' ? '' : captcha === 'hold' ? '⏱' : '✓'}
                </div>
                <div class="text">
                  ${captcha === 'idle' ? '我不是机器人' : captcha === 'hold' ? '按住不放，满 10 秒自动通过…' : '验证通过'}
                  <small>${captcha === 'hold' ? '松开即取消并重新计时' : '受假想的安全策略保护'}</small>
                </div>
              </div>
              <p class="hintline" data-captcha-hint>${phraseDone ? '按住左侧方框 10 秒即可通过。' : '请先完成步骤一。'}</p>
            </div>
            <div class="foot">
              <button class="primary" data-pass ${phraseDone && captchaDone ? '' : 'disabled'}>
                ${phraseDone && captchaDone ? '验证通过，继续使用' : '请完成以上两步'}
              </button>
              <p class="prank">※ 这是<strong>假的</strong>“登录认证”弹窗：口令与人机验证都在本机用 JavaScript 判定，
                不联网、不发送任何数据、不修改你的账户或登录状态。完成仪式即可继续。</p>
            </div>`
      
          const input = card.querySelector('input')
          if (input !== null && !phraseDone) {
            input.value = lines[done] ?? ''
            window.setTimeout(() => { input.focus() }, 30)
            input.addEventListener('keydown', (event) => {
              event.stopPropagation()
              event.stopImmediatePropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                submitLine()
              }
            })
            input.addEventListener('input', () => {
              lines[done] = input.value
              const hint = card.querySelector('[data-hint]')
              if (hint !== null) {
                hint.className = 'hintline'
                hint.textContent = '提示：不需要加标点，连续输入即可。'
              }
            })
          }
      
          card.querySelector('[data-box]')?.addEventListener('pointerdown', onPointerDown)
          card.querySelector('[data-box]')?.addEventListener('pointerup', onPointerUp)
          card.querySelector('[data-box]')?.addEventListener('pointerleave', onPointerUp)
          card.querySelector('[data-pass]')?.addEventListener('click', pass)
        }
      
        /** Validate and consume the current transcription line. */
        const submitLine = () => {
          const input = card.querySelector('input')
          if (input === null) return
          const value = input.value
          const hint = card.querySelector('[data-hint]')
          if (!phraseAccepted(value)) {
            if (hint !== null) {
              hint.className = 'hintline bad'
              hint.textContent = value.trim() === ''
                ? '请输入口令后再回车。'
                : `口令不匹配，请重新默写（第 ${done + 1} 遍）。`
            }
            input.value = ''
            return
          }
          lines[done] = value
          done += 1
          render()
        }
      
        const onPointerDown = (event) => {
          if (done < PHRASE_REPEATS || captcha !== 'idle') return
          event.preventDefault()
          captcha = 'hold'
          render()
          window.addEventListener('pointerup', onPointerUp)
          holdTimer = window.setTimeout(() => {
            if (captcha !== 'hold') return
            captcha = 'done'
            render()
          }, CAPTCHA_HOLD_MS)
        }
      
        const onPointerUp = () => {
          if (captcha !== 'hold') return
          window.clearTimeout(holdTimer)
          window.removeEventListener('pointerup', onPointerUp)
          captcha = 'idle'
          render()
        }
      
        /** Finish the ceremony. */
        const pass = () => {
          if (settled || done < PHRASE_REPEATS || captcha !== 'done') return
          settled = true
          window.removeEventListener('pointerup', onPointerUp)
          close()
          face.onPass?.()
        }
      
        const close = () => {
          wrap.classList.remove('in')
          window.setTimeout(() => { host.style.display = 'none' }, 160)
          if (typeof document.activeElement?.blur === 'function') document.activeElement.blur()
        }
      
        render()
        document.body.append(host)
        host.style.display = 'block'
        void wrap.offsetWidth
        wrap.classList.add('in')
      
        return {
          isOpen: () => settled !== true && host.style.display !== 'none',
          /**
           * Whether an event came from inside this dialog.
           * @param event - the event to test (shadow-retargeting aware).
           * @returns true when the event originated in this dialog's subtree.
           */
          ownsEvent: (event) => {
            const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
            return path.some(node => node instanceof Element && node.getRootNode?.() === root)
          },
          close,
          destroy: () => {
            window.clearTimeout(holdTimer)
            window.removeEventListener('pointerup', onPointerUp)
            host.remove()
          },
          focus: () => card.querySelector('input')?.focus(),
          /** Test hooks: drive the ceremony without a pointer. */
          __test: {
            /** Submit one transcription line. */
            type: (value) => {
              const input = card.querySelector('input')
              if (input === null) return false
              input.value = value
              submitLine()
              return true
            },
            /** Complete both steps with the given phrase. */
            passWith: (value) => {
              let guard = 0
              while (done < PHRASE_REPEATS && guard < PHRASE_REPEATS + 2) {
                const input = card.querySelector('input')
                if (input === null) break
                input.value = value
                submitLine()
                guard += 1
              }
              window.clearTimeout(holdTimer)
              captcha = 'done'
              render()
            },
            /** Press the final button. */
            clickPass: pass,
            /** Current internal progress, for assertions. */
            state: () => ({ done, captcha, settled, phrase: GATE_PHRASE }),
          },
        }
      }
      return { createGateOverlay };
    })();
    
    // ---- src/client/history.js ----
    __mod["src/client/history.js"] = (() => {
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
       const HISTORY_LIMIT = 50
      
      /** The storage key; bumped when the row shape changes. */
       const HISTORY_KEY = 'dsh-american-detector/history/v1'
      
      /** Read the stored history, newest last; `[]` when absent or unreadable. */
       function readHistory() {
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
       function pushHistory(history, row) {
        const next = [...history, row]
        return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
      }
      
      /** Persist the history; failure is not fatal. */
       function saveHistory(history) {
        try {
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)))
        } catch {
          /* storage full or unavailable: the detector still works, just forgets */
        }
      }
      
      /** Drop the stored history. */
       function clearHistory() {
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
       function summarizeHistory(history) {
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
      return { HISTORY_LIMIT, HISTORY_KEY, readHistory, pushHistory, saveHistory, clearHistory, summarizeHistory };
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
       *   ?dsh-ban=1        force the dialog on every send (test mode)
       *   ?dsh-ban=0        never show it (kills the history latch too)
       *   ?dsh-ban-score=N  move the log-odds threshold (default 2.2)
       *   ?dsh-ban-off=ids  ignore signals by id
       *   ?dsh-gate=1       force the login gate on the next instruction
       *   ?dsh-gate=0       disable the periodic login gate
       *   ?dsh-keywords=0   disable the built-in keyword rule (typing 「test」)
       *   ?dsh-ip=1         allow one public-IP lookup for the coherence check
       *   window.__AMERICAN_DETECTOR__.verdict() / .history() / .gate() / .export()
       *
       * Keyword rule: submitting a line that is exactly one of BAN_KEYWORDS (「test」)
       * forces the ban dialog regardless of the verdict.
       *
       * Memory: every send appends one row to localStorage; any "American" row among
       * the last HISTORY_LIMIT keeps the alarm latched. Independently, one send in
       * every four or five is claimed by the blue login gate, which outranks the ban
       * dialog and must be passed (three transcriptions + a 10s hold) to continue.
       */
      let { browserSignals } = __mod["src/client/browser-signals.js"];
      let { MODEL, THRESHOLD_LOGIT, replayHistory, scoreSignals } = __mod["src/client/score.js"];
      let { createBanOverlay } = __mod["src/client/overlay.js"];
      let { createGateOverlay } = __mod["src/client/gate-overlay.js"];
      let { GATE_PHRASE, advanceGate, clearGateState, markGatePending, passGate, phraseAccepted, readGateState } = __mod["src/client/gate.js"];
      let { HISTORY_LIMIT, clearHistory, pushHistory, readHistory, saveHistory, summarizeHistory } = __mod["src/client/history.js"];
      /** Client plugin name, matching this package's id in the boot graph. */
       const name = 'dsh-american-detector'
      
      /** Both services exist in the shipped Web composition. */
       const inject = ['sessions', 'slots']
      
      /** The host route that carries the OS-level signals. */
      const REPORT_URL = '/api/american-detector/report'
      
      /**
       * Instructions that always raise the ban dialog, whatever the verdict says.
       *
       * A built-in gag rule: typing this word is enough. Matching is on the whole
       * trimmed line, case-folded, with trailing punctuation ignored — so "Test",
       * "test!" and " TEST " fire, while a sentence that merely contains it does not.
       */
      const BAN_KEYWORDS = ['test']
      
      /** Parse the query-string knobs: dsh-ban, dsh-ban-score, dsh-ban-off, dsh-gate, dsh-ip. */
      function readOptions() {
        const options = { lock: null, threshold: undefined, disabled: new Set(), gate: null, ip: false, keywords: true }
        const search = (() => {
          try {
            return new URLSearchParams(window.location.search)
          } catch {
            return null
          }
        })()
        if (search === null) return options
        const ip = search.get('dsh-ip')
        if (ip === '1' || ip === 'true' || ip === 'on') options.ip = true
        try {
          const value = search.get('dsh-ban')
          if (value === '1' || value === 'true' || value === 'on') options.lock = true
          if (value === '0' || value === 'false' || value === 'off') options.lock = false
          const score = Number(search.get('dsh-ban-score'))
          if (Number.isFinite(score) && score !== 0) options.threshold = score
          for (const id of (search.get('dsh-ban-off') ?? '').split(',')) {
            if (id.trim() !== '') options.disabled.add(id.trim())
          }
          const gate = search.get('dsh-gate')
          if (gate === '1' || gate === 'true' || gate === 'on') options.gate = true
          if (gate === '0' || gate === 'false' || gate === 'off') options.gate = false
          const keywords = search.get('dsh-keywords')
          if (keywords === '0' || keywords === 'false' || keywords === 'off') options.keywords = false
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
            entry.fire(`会话 ${String(bindingId)} 提交了新的指令`, item?.text)
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
        let gate = null
        let opened = 0
        const gateRuns = { raised: 0, passed: 0 }
        let history = readHistory()
        let gateState = readGateState()
      
        /** Pure evaluation — never records, so diagnostics cannot pollute the history. */
        const computeVerdict = () => {
          const browser = browserSignals(hostReport).signals
          const scored = scoreSignals([...browser, ...(hostReport?.signals ?? [])], { threshold: options.threshold })
          // Latch: the alarm stays on while any of the last HISTORY_LIMIT verdicts
          // counted as American under the model that produced it.
          const replayed = replayHistory(history)
          const latched = options.lock !== false && replayed.latched
          const american = options.lock === true ? true : options.lock === false ? false : scored.american || latched
          return {
            ...scored,
            american,
            rawAmerican: scored.american,
            latched,
            historyCount: history.length,
            historyAlarm: replayed.count,
            historyLastAt: replayed.last === null ? null : new Date(replayed.last.at).toLocaleString('zh-CN'),
            testMode: options.lock === true,
            hostError: hostReport?.error ?? null,
            hostAt: hostReport?.at ?? null,
            ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
            model: MODEL,
          }
        }
      
        /**
         * Evaluate and append to the rolling history (one row per instruction sent).
         * @param trigger - what raised this evaluation, for the log and the history.
         * @param forced - { keyword } when a built-in keyword forced the verdict.
         */
        const evaluate = (trigger, forced = null) => {
          const base = computeVerdict()
          const verdict = forced === null ? base : { ...base, american: true, rawAmerican: true, forced: true, keyword: forced.keyword }
          const row = {
            at: Date.now(),
            model: MODEL,
            // A keyword hit is a gag, not a reading of the evidence, so it must never
            // contribute to the rolling alarm: the row is stored for forensics with
            // `american: false` and an explicit `forced` marker.
            american: forced === null ? verdict.american : false,
            raw: forced === null ? verdict.rawAmerican : false,
            total: verdict.total,
            threshold: verdict.threshold,
            proSum: verdict.proSum,
            conSum: verdict.conSum,
            proCount: verdict.proCount,
            conCount: verdict.conCount,
            foldedCount: verdict.foldedCount,
            reasons: verdict.reasons,
            counterReasons: verdict.counterReasons,
            trigger: String(trigger ?? ''),
            latched: verdict.latched,
            ...(forced === null ? {} : { forced: true, keyword: forced.keyword }),
          }
          history = pushHistory(history, row)
          saveHistory(history)
          return verdict
        }
      
        /**
         * Whether a submitted line is one of the built-in ban triggers.
         * @param text - the draft as submitted.
         * @returns the matched keyword, or null.
         */
        const banKeywordIn = (text) => {
          const line = String(text ?? '').trim().toLowerCase().replace(/[\s!！。.，,？?~～]+$/u, '')
          return line === '' ? null : BAN_KEYWORDS.find(keyword => keyword === line) ?? null
        }
      
        const ensureOverlay = (verdict) => {
          if (overlay === null) overlay = createBanOverlay(verdict)
          else overlay.setVerdict(verdict)
          return overlay
        }
      
        const gateOpen = () => gate !== null && gate.isOpen()
      
        /** Raise the periodic authentication gate (higher priority than the ban dialog). */
        const openGate = () => {
          if (gateOpen()) return gate
          overlay?.close()
          // Persist the pending challenge first, so a reload cannot skip it.
          gateState = markGatePending(gateState)
          gate = createGateOverlay({
            nextAt: gateState.nextAt,
            onPass: () => {
              gateState = passGate(gateState)
              gateRuns.passed += 1
              ctx.logger?.info?.(`american-detector: 登录认证已通过，下一次在第 ${gateState.nextAt} 轮`)
            },
          })
          gateRuns.raised += 1
          ctx.logger?.info?.(`american-detector: 第 ${gateState.turns} 轮 → 弹出登录认证（下一轮 ${gateState.nextAt}）`)
          return gate
        }
      
        const entry = {
          /**
           * Handle one instruction the user just sent.
           * @returns 'gate' | 'ban' | false — which ceremony claimed the keystroke.
           */
          fire(trigger, text) {
            // The gate outranks the ban dialog, and it blocks until it is passed.
            if (gateOpen()) {
              gate.focus()
              return 'gate'
            }
            // The built-in keyword rule is unconditional and comes before the counter:
            // it must fire even if the periodic gate were about to claim this send.
            const keyword = options.keywords === false ? null : banKeywordIn(text)
            if (keyword !== null && options.lock !== false) {
              const verdict = evaluate(trigger, { keyword })
              const face = ensureOverlay(verdict)
              face.open()
              opened += 1
              ctx.logger?.info?.(`american-detector: 命中关键词「${keyword}」→ 弹出假封禁弹窗（${trigger}）`)
              return 'ban'
            }
            if (options.gate !== false) {
              const gateStep = advanceGate(gateState, options.gate === true)
              gateState = gateStep.state
              if (gateStep.trigger && options.lock !== false) {
                openGate()
                return 'gate'
              }
            }
            const verdict = evaluate(trigger)
            if (!verdict.american) return false
            const face = ensureOverlay(verdict)
            face.open()
            opened += 1
            ctx.logger?.info?.(
              `american-detector: 判定为美国用户（${verdict.total}/${verdict.threshold}${verdict.latched ? '，来自历史警报' : ''}，${trigger}）→ 弹出假封禁弹窗`,
            )
            return 'ban'
          },
          verdict: computeVerdict,
          opened: () => opened,
          gateState: () => ({ ...gateState, raised: gateRuns.raised, passed: gateRuns.passed, open: gateOpen() }),
        }
      
        /* ---------------------------------------------------------------- *
         * Host report
         * ---------------------------------------------------------------- */
        const loadReport = async () => {
          try {
            const url = options.ip === true ? `${REPORT_URL}?includeIp=1` : REPORT_URL
            const response = await fetch(url, { headers: { accept: 'application/json' } })
            if (!response.ok) return null
            const value = await response.json()
            return value !== null && typeof value === 'object' ? value : null
          } catch {
            return null
          }
        }
        // The host half may still be mounting when this plugin applies, so a failed
        // first read retries a few times instead of silently scoring without it.
        const warmReport = async (attempt = 0) => {
          const value = await loadReport()
          if (value !== null) {
            hostReport = value
            return value
          }
          if (attempt < 5) window.setTimeout(() => { void warmReport(attempt + 1) }, 2000 * (attempt + 1))
          return null
        }
        void warmReport()
      
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
          // The gate owns the keyboard while it is up: its own input field is the
          // only place a key may land, and a send attempt just refocuses it.
          if (gateOpen()) {
            if (gate.ownsEvent(event)) return
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            gate.focus()
            return
          }
          const target = event.target
          const editing = target instanceof HTMLElement
            && (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
          if (!editing) return
          const text = target.isContentEditable ? target.innerText : target.value
          if (typeof text !== 'string' || text.trim() === '') return
          entry.fire('检测到 Enter 发送指令', text)
        }
      
        ctx.effect(() => {
          window.addEventListener('keydown', onKeydown, true)
          return () => window.removeEventListener('keydown', onKeydown, true)
        }, 'american-detector: composer enter fallback')
      
        /* ---------------------------------------------------------------- *
         * Dismissal: any key closes the ban dialog; the gate has no dismissal.
         * ---------------------------------------------------------------- */
        const onAnyKey = (event) => {
          if (gateOpen()) {
            // The gate's own field stops propagation before this listener runs, so a
            // key arriving here came from outside it: swallow it and hand focus back.
            if (gate.ownsEvent(event)) return
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            gate.focus()
            return
          }
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
          verdict: () => computeVerdict(),
          /** The rolling memory: counts, the last American row, and recent rows. */
          history: () => summarizeHistory(history),
          /** Full history as JSON text, for pasting into an issue or a chat. */
          export: () => JSON.stringify({ verdict: computeVerdict(), history, gate: entry.gateState() }, null, 2),
          clearHistory: () => {
            clearHistory()
            history = []
            return history
          },
          /** The login-gate counter, pending challenge, and how many gates were raised. */
          gate: () => entry.gateState(),
          /** Raise the blue login gate right now. */
          gateNow: () => openGate(),
          /** Reset the gate counter (and any pending challenge). */
          resetGate: () => {
            clearGateState()
            gateState = readGateState()
            return entry.gateState()
          },
          /** The keyword rule: which lines force the ban dialog. */
          keywords: () => [...BAN_KEYWORDS],
          /** Whether a line would trigger the keyword rule. */
          matchesKeyword: value => banKeywordIn(value),
          /** The accepted transcription rule, for tests and curiosity. */
          phrase: value => phraseAccepted(value),
          expectedPhrase: GATE_PHRASE,
          show: () => ensureOverlay(computeVerdict()).open(),
          hide: () => overlay?.close(),
          toggle: () => entry.fire('手动触发'),
          rescan: async () => {
            await fetch('/api/american-detector/refresh').catch(() => undefined)
            hostReport = await loadReport()
            return computeVerdict()
          },
          opens: () => opened,
          historyLimit: HISTORY_LIMIT,
          /** The live score model identity and threshold. */
          model: () => ({ model: MODEL, threshold: THRESHOLD_LOGIT }),
          version: '1.4.0',
        }
      
        /* ---------------------------------------------------------------- *
         * Boot: a challenge left pending by a reload comes straight back.
         * ---------------------------------------------------------------- */
        if (gateState.pending === true && options.lock !== false) {
          openGate()
          ctx.logger?.info?.('american-detector: 恢复上次未完成的登录认证')
        }
      
        ctx.logger?.info?.(
          `american-detector: 浏览器侧已就位（模型 ${MODEL}，判定线 ${THRESHOLD_LOGIT}；历史 ${history.length}/${HISTORY_LIMIT} 条，`
          + `警报${history.some(row => row.american === true) ? '已拉响' : '未拉响'}；`
          + `登录认证：已过 ${gateState.passed} 次，下一次第 ${gateState.nextAt} 轮`
          + `${gateState.pending ? '（有未完成的验证，锁定中）' : ''}`
          + `${options.lock === null ? '' : options.lock ? '，测试模式：必定弹窗' : '，测试模式：不弹窗'}）`,
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
