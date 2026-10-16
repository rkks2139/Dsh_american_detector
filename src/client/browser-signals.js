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
export function browserSignals(hostReport = null) {
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
