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
export function browserSignals() {
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
