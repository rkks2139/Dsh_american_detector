/**
 * Host-side "are you American?" detection.
 *
 * Everything here is best-effort and read-only: it inspects this machine's
 * operating system, input methods, installed software, environment, network
 * routes and running proxy clients to produce the evidence the browser half
 * cannot see by itself. It writes nothing and, unless `includeIp` is requested,
 * sends nothing off-box.
 *
 * Each signal is scored in log-odds (`logit`), positive toward "American":
 *
 *   { id, label, note, group, logit, value, extra?, informational? }
 *
 * `group` names the evidence dimension; co-firing rows in one group collapse to
 * a single term in the scorer (src/client/score.js), and `extra.hard` marks a
 * signal strong enough to decide alone. The browser half adds its own rows and
 * owns the final decision, because only it knows the browser's language.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs'
import { homedir, networkInterfaces, hostname, platform, release, arch, userInfo } from 'node:os'
import { join } from 'node:path'

/** Run a small read-only command; resolves to '' on any failure. */
function run(command, args, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const child = execFile(command, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        done(error !== null && error !== undefined ? '' : String(stdout))
      })
      child.on('error', () => done(''))
    } catch {
      done('')
    }
  })
}

/** Read a small text file, or '' when unreadable. */
function readText(path, limit = 4096) {
  try {
    return readFileSync(path, 'utf8').slice(0, limit)
  } catch {
    return ''
  }
}

/** List directory entries, or [] when unreadable. */
function listDir(path) {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

/** One scored signal row. */
function signal(id, label, note, group, logit, value, extra) {
  return { id, label, note, group, logit, value, ...(extra === undefined ? {} : extra) }
}

/** Split a UI language tag like zh-Hans-CN into its language, script and region. */
function parseLanguageTag(tag) {
  const parts = String(tag ?? '').replaceAll('_', '-').split('-').filter(Boolean)
  return {
    language: (parts[0] ?? '').toLowerCase(),
    region: (parts.find((part, index) => index > 0 && part.length === 2) ?? '').toUpperCase(),
    script: parts.find((part, index) => index > 0 && part.length === 4) ?? '',
  }
}

/* ------------------------------------------------------------------ *
 * Installed software: American vs Chinese vendors
 * ------------------------------------------------------------------ */

/** Applications whose vendor's principal operator is American. */
const US_SOFTWARE = [
  { app: 'Google Chrome.app', cli: 'Google Chrome', company: 'Google（美国）', match: /^google chrome(\.app)?$/i },
  { app: 'Google Chrome Canary.app', company: 'Google（美国）', match: /^google chrome canary(\.app)?$/i },
  { app: 'Arc.app', cli: 'Arc', company: 'The Browser Company（美国）', match: /^arc(\.app)?$/i },
  { app: 'Dia.app', company: 'The Browser Company（美国）', match: /^dia(\.app)?$/i },
  { app: 'Safari.app', company: 'Apple（美国）', match: /^safari(\.app)?$/i },
  { app: 'Firefox.app', cli: 'firefox', company: 'Mozilla（美国）', match: /^firefox(\.app)?$/i },
  { app: 'Microsoft Edge.app', cli: 'Microsoft Edge', company: 'Microsoft（美国）', match: /^microsoft edge(\.app)?$/i },
  { app: 'Visual Studio Code.app', cli: 'code', company: 'Microsoft（美国）', match: /^visual studio code(\.app)?$/i },
  { app: 'Slack.app', cli: 'Slack', company: 'Salesforce（美国）', match: /^slack(\.app)?$/i },
  { app: 'Discord.app', company: 'Discord（美国）', match: /^discord(\.app)?$/i },
  { app: 'Figma.app', company: 'Figma（美国）', match: /^figma(\.app)?$/i },
  { app: 'Notion.app', company: 'Notion Labs（美国）', match: /^notion(\.app)?$/i },
  { app: 'Spotify.app', company: 'Spotify（主体在美上市）', match: /^spotify(\.app)?$/i },
  { app: 'Zoom.app', cli: 'zoom.us', company: 'Zoom（美国）', match: /^zoom(\.app)?$/i },
  { app: 'Docker.app', cli: 'docker', company: 'Docker Inc.（美国）', match: /^docker(\.app)?$/i },
  { app: 'Postman.app', company: 'Postman（美国）', match: /^postman(\.app)?$/i },
  { app: 'Obsidian.app', company: 'Obsidian（美国）', match: /^obsidian(\.app)?$/i },
  { app: 'ChatGPT.app', cli: 'chatgpt', company: 'OpenAI（美国）', match: /^chatgpt(\.app)?$/i },
  { app: 'Claude.app', cli: 'claude', company: 'Anthropic（美国）', match: /^claude(\.app)?$/i },
  { app: 'Cursor.app', cli: 'cursor', company: 'Anysphere（美国）', match: /^cursor(\.app)?$/i },
  { app: 'GitHub Desktop.app', company: 'GitHub / Microsoft（美国）', match: /^github desktop(\.app)?$/i },
  { app: 'Xcode.app', company: 'Apple（美国）', match: /^xcode(\.app)?$/i },
  { app: 'Adobe Photoshop 2024.app', company: 'Adobe（美国）', match: /^adobe photoshop/i },
]

/** Applications whose vendor's principal operator is Chinese. */
const CN_SOFTWARE = [
  { app: 'WeChat.app', cli: 'wechat', company: '腾讯（中国）', match: /^wechat(\.app)?$/i },
  { app: 'QQ.app', cli: 'qq', company: '腾讯（中国）', match: /^qq(\.app)?$/i },
  { app: 'DingTalk.app', company: '阿里（中国）', match: /^dingtalk(\.app)?$/i },
  { app: 'Feishu.app', company: '字节跳动（中国）', match: /^feishu(\.app)?$/i },
  { app: 'Lark.app', company: '字节跳动（中国）', match: /^lark(\.app)?$/i },
  { app: 'BaiduNetdisk_mac.app', company: '百度（中国）', match: /^baidunetdisk/i },
  { app: 'Thunder.app', company: '迅雷（中国）', match: /^thunder(\.app)?$/i },
  { app: 'TencentMeeting.app', company: '腾讯会议（中国）', match: /^tencentmeeting(\.app)?$/i },
  { app: 'WPS Office.app', company: '金山（中国）', match: /^wps/i },
  { app: 'Douyin.app', company: '字节跳动（中国）', match: /^douyin(\.app)?$/i },
  { app: 'Bilibili.app', company: '哔哩哔哩（中国）', match: /^bilibili(\.app)?$/i },
  { app: 'Xiaohongshu.app', company: '小红书（中国）', match: /^xiaohongshu(\.app)?$/i },
  { app: 'Taobao.app', company: '阿里（中国）', match: /^taobao(\.app)?$/i },
  { app: 'Alipay.app', company: '蚂蚁（中国）', match: /^alipay(\.app)?$/i },
  { app: 'NeteaseMusic.app', company: '网易云音乐（中国）', match: /^netease ?music(\.app)?$/i },
  { app: 'Shadowrocket.app', company: 'Shadowrocket（跨境代理，中文圈主要分发）', match: /^shadowrocket(\.app)?$/i, proxy: true },
]

/** CLI-only probes for American toolchains. */
const US_CLI = [
  { cli: 'ollama', company: 'Ollama（美国）' },
  { cli: 'codex', company: 'OpenAI Codex CLI（美国）' },
  { cli: 'gh', company: 'GitHub CLI / Microsoft（美国）' },
  { cli: 'brew', company: 'Homebrew（美国）' },
  { cli: 'adb', company: 'Google Android Platform Tools（美国）' },
]

/** Resolve a binary through PATH without spawning a shell. */
function which(binary) {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '') continue
    const candidate = join(dir, binary)
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* keep looking */
    }
  }
  return undefined
}

/** Scan the standard application directories, one level into suite folders. */
function scanApplications() {
  const names = new Set()
  for (const root of ['/Applications', join(homedir(), 'Applications'), '/System/Applications']) {
    for (const entry of listDir(root)) {
      names.add(entry)
      const nested = join(root, entry)
      try {
        if (!statSync(nested).isDirectory()) continue
      } catch {
        continue
      }
      for (const inner of listDir(nested)) names.add(inner)
    }
  }
  return names
}

/** Installed programs from the Windows uninstall registry hives. */
async function scanWindowsRegistry() {
  const names = new Set()
  for (const hive of [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]) {
    const out = await run('reg', ['query', hive, '/s', '/v', 'DisplayName'], 6000)
    for (const line of out.split(/\r?\n/)) {
      const match = /DisplayName\s+REG_SZ\s+(.+)$/i.exec(line.trim())
      if (match !== null) names.add(match[1].trim())
    }
  }
  return names
}

/** Match one catalog entry against the collected program names. */
function matchCatalog(entry, names) {
  const shellName = entry.app.replace(/\.app$/i, '')
  for (const name of names) {
    if (entry.match.test(name)) return name
    if (name.toLowerCase().includes(shellName.toLowerCase())) return name
  }
  if (entry.cli !== undefined && which(entry.cli) !== undefined) return `${entry.cli}（PATH）`
  return undefined
}

/** Detect installed American and Chinese software, and their balance. */
async function detectSoftware() {
  const names = new Set()
  if (platform() === 'win32') for (const name of await scanWindowsRegistry()) names.add(name)
  else for (const name of scanApplications()) names.add(name)

  const us = []
  const cn = []
  for (const entry of US_SOFTWARE) {
    const where = matchCatalog(entry, names)
    if (where !== undefined) us.push(`${entry.app} — ${entry.company}`)
  }
  for (const entry of US_CLI) {
    if (which(entry.cli) === undefined) continue
    us.push(`${entry.cli}（PATH） — ${entry.company}`)
  }
  let proxyApp = false
  for (const entry of CN_SOFTWARE) {
    const where = matchCatalog(entry, names)
    if (where === undefined) continue
    cn.push(`${entry.app} — ${entry.company}`)
    if (entry.proxy === true) proxyApp = true
  }
  const total = us.length + cn.length
  return { us, cn, proxyApp, usShare: total === 0 ? 0 : us.length / total }
}

/* ------------------------------------------------------------------ *
 * Input methods and keyboard layouts — the strongest language-habit signal
 * ------------------------------------------------------------------ */

/** Parse `defaults read com.apple.HIToolbox ...InputSources` output. */
function parseInputSources(raw) {
  const sources = []
  for (const block of raw.split('},')) {
    const name = /"KeyboardLayout Name"\s*=\s*"?([^";\n]+)"?/.exec(block)
    const bundle = /"Bundle ID"\s*=\s*"?([^";\n]+)"?/.exec(block)
    const kind = /InputSourceKind\s*=\s*"?([^";\n]+)"?/.exec(block)
    const mode = /"Input Mode"\s*=\s*"?([^";\n]+)"?/.exec(block)
    sources.push({
      name: name?.[1]?.trim() ?? '',
      bundle: bundle?.[1]?.trim() ?? '',
      kind: kind?.[1]?.trim() ?? '',
      mode: mode?.[1]?.trim() ?? '',
    })
  }
  return sources
}

const CJK_INPUT = /SCIM|TCIM|Kotoeri|Pinyin|Zhuyin|Cangjie|Wubi|Sogou|Baidu|QQInput|Rime|Squirrel|Hanin/i
const US_LAYOUT = /^(ABC|U\.S\.|US|Dvorak|Colemak)$/i

/** What the user types with, and which keyboard layouts are enabled. */
async function detectInputMethods() {
  if (platform() !== 'darwin') {
    return { available: false, cjk: [], layouts: [], usLayout: false, current: '', platforms: [platform()] }
  }
  const sources = parseInputSources(await run('defaults', ['read', 'com.apple.HIToolbox', 'AppleEnabledInputSources']))
  const selected = parseInputSources(await run('defaults', ['read', 'com.apple.HIToolbox', 'AppleSelectedInputSources']))
  const cjk = sources.filter(source => CJK_INPUT.test(`${source.bundle} ${source.mode} ${source.name}`))
  const layouts = sources.filter(source => /Keyboard Layout/i.test(source.kind)).map(source => source.name)
  const current = selected[0] ?? {}
  return {
    available: true,
    cjk: [...new Set(cjk.map(source => source.mode || source.bundle || source.name))],
    layouts: [...new Set(layouts.filter(Boolean))],
    usLayout: layouts.some(name => US_LAYOUT.test(name)),
    current: current.name || current.mode || current.bundle || '',
  }
}

/* ------------------------------------------------------------------ *
 * Routes and running proxy clients — real tunnel evidence
 * ------------------------------------------------------------------ */

const TUNNEL_INTERFACE = /^(utun|tun|tap|wg|ppp|ipsec|gpd|zt)/i

/**
 * Proxy/VPN clients, signed by population.
 *
 * These are the strongest *population* evidence on the machine and they cut in
 * opposite directions, which is why they carry opposite signs:
 *
 *   - Chinese-market circumvention clients (Shadowrocket, Clash, Surge, …) are
 *     used by Chinese-speaking users to reach the outside internet. Seeing one
 *     means "this person is behind the GFW", i.e. NOT an American user, even
 *     though it is also a VPN.
 *   - Western corporate/consumer VPNs (WireGuard, OpenVPN, NordVPN, …) are what
 *     an American uses to look like they are somewhere else; weak positive.
 *
 * The separate "uses any tunnel at all" question belongs to the routing signal.
 */
const PROXY_CLIENTS = [
  { match: /shadowrocket|shadowsocks|ShadowsocksX/i, name: 'Shadowrocket / Shadowsocks', family: 'cn-proxy', logit: -1.6 },
  { match: /clash|ClashX|mihomo|ClashVerge/i, name: 'Clash / mihomo', family: 'cn-proxy', logit: -1.6 },
  { match: /quantumult/i, name: 'Quantumult', family: 'cn-proxy', logit: -1.6 },
  { match: /v2ray|xray|sing-box|singbox/i, name: 'V2Ray / Xray / sing-box', family: 'cn-proxy', logit: -1.6 },
  { match: /surge/i, name: 'Surge', family: 'cn-proxy', logit: -1.4 },
  { match: /trojan/i, name: 'Trojan', family: 'cn-proxy', logit: -1.4 },
  { match: /clash.*verge|verge.*clash/i, name: 'Clash Verge', family: 'cn-proxy', logit: -1.6 },
  { match: /wireguard/i, name: 'WireGuard', family: 'western-vpn', logit: 0.4 },
  { match: /openvpn/i, name: 'OpenVPN', family: 'western-vpn', logit: 0.4 },
  { match: /tailscale/i, name: 'Tailscale', family: 'western-vpn', logit: 0.1 },
  { match: /nordvpn|expressvpn|protonvpn|surfshark|astrill|vyprvpn/i, name: '商业 VPN 客户端', family: 'western-vpn', logit: 0.2 },
]

/** Which recognition of a proxy or VPN client is running. */
async function detectProxyClients() {
  const out = platform() === 'win32' ? await run('tasklist', [], 4000) : await run('ps', ['-axo', 'comm'], 4000)
  const found = []
  for (const entry of PROXY_CLIENTS) {
    if (entry.match.test(out)) found.push({ name: entry.name, logit: entry.logit })
  }
  return found
}

/** The interface the default route uses, the tunnels, and proxy settings. */
async function detectRouting() {
  const defaultRoute = (await run('route', ['-n', 'get', 'default'], 2500)).trim()
  const interfaceName = /interface:\s*(\S+)/.exec(defaultRoute)?.[1] ?? ''
  const interfaces = []
  try {
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
      if (addresses === undefined) continue
      if (!addresses.some(address => address.internal !== true)) continue
      let mtu = 0
      if (platform() !== 'win32') mtu = Number(/mtu\s+(\d+)/.exec(await run('ifconfig', [name], 1500))?.[1] ?? 0)
      interfaces.push({ name, mtu, tunnel: TUNNEL_INTERFACE.test(name) })
    }
  } catch {
    /* ignore */
  }
  const envProxies = []
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'SOCKS_PROXY']) {
    if (process.env[key] !== undefined && process.env[key] !== '') envProxies.push(key)
  }
  const systemProxies = []
  if (platform() === 'darwin') {
    for (const line of (await run('scutil', ['--proxy'], 2500)).split(/\r?\n/)) {
      const match = /^\s*(HTTPEnable|HTTPSEnable|SOCKSEnable)\s*:\s*(\S+)/.exec(line)
      if (match !== null && match[2].trim() === '1') systemProxies.push(match[1].replace(/Enable$/, ''))
    }
  }
  return {
    interfaceName,
    defaultOnTunnel: interfaceName !== '' && TUNNEL_INTERFACE.test(interfaceName),
    interfaces,
    tunnels: interfaces.filter(entry => entry.tunnel),
    envProxies,
    systemProxies,
  }
}

/* ------------------------------------------------------------------ *
 * LLM provider configuration
 * ------------------------------------------------------------------ */

const LLM_DIRS = [
  { path: '.claude', provider: 'Claude Code / Anthropic（美国）' },
  { path: '.codex', provider: 'OpenAI Codex CLI（美国）' },
  { path: '.ollama', provider: 'Ollama（美国）' },
  { path: '.cursor', provider: 'Cursor（美国）' },
  { path: '.continue', provider: 'Continue（美国）' },
  { path: '.lmstudio', provider: 'LM Studio（美国）' },
  { path: '.copilot', provider: 'GitHub Copilot / Microsoft（美国）' },
  { path: 'Library/Application Support/Claude', provider: 'Claude Desktop（美国）' },
  { path: 'Library/Application Support/ChatGPT', provider: 'ChatGPT Desktop（美国）' },
  { path: 'Library/Application Support/Codex', provider: 'OpenAI Codex（美国）' },
  { path: 'Library/Application Support/OpenAI', provider: 'OpenAI（美国）' },
  { path: '.config/anthropic', provider: 'Anthropic（美国）' },
  { path: '.config/openai', provider: 'OpenAI（美国）' },
  { path: '.config/ollama', provider: 'Ollama（美国）' },
  { path: '.kimi', provider: 'Kimi / Moonshot（中国）', cn: true },
]

const LLM_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'OLLAMA_HOST', 'OLLAMA_MODELS', 'AZURE_OPENAI_ENDPOINT', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY', 'ZHIPUAI_API_KEY',
]

const CN_LLM_ENV = new Set(['DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY', 'ZHIPUAI_API_KEY'])

/** Which LLM providers are configured on this machine. */
function detectLlmProviders() {
  const us = []
  const cn = []
  const where = []
  for (const entry of LLM_DIRS) {
    if (!existsSync(join(homedir(), entry.path))) continue
    where.push(`~/${entry.path} 存在`)
    if (entry.cn === true) cn.push(entry.provider)
    else us.push(entry.provider)
  }
  const envKeys = []
  for (const key of LLM_ENV_KEYS) {
    if (process.env[key] === undefined || process.env[key] === '') continue
    envKeys.push(key)
    if (CN_LLM_ENV.has(key)) cn.push(`${key}（中国厂商）`)
    else us.push(`${key} 已设置`)
  }
  return { us: [...new Set(us)], cn: [...new Set(cn)], where, envKeys }
}

/* ------------------------------------------------------------------ *
 * Operating system, locale, container, zones
 * ------------------------------------------------------------------ */

/** Read /proc and env markers to recognize a container. */
function detectContainer() {
  if (platform() !== 'linux') return { container: false, markers: [] }
  const markers = []
  if (existsSync('/.dockerenv')) markers.push('/.dockerenv 存在')
  if (existsSync('/run/.containerenv')) markers.push('/run/.containerenv 存在')
  const cgroup = readText('/proc/1/cgroup', 8192)
  for (const pattern of ['docker', 'kubepods', 'containerd', 'podman', 'lxc']) {
    if (cgroup.includes(pattern)) markers.push(`/proc/1/cgroup 含 ${pattern}`)
  }
  const mountinfo = readText('/proc/self/mountinfo', 65536)
  for (const pattern of ['overlay', 'docker', 'containerd', 'kubelet']) {
    if (mountinfo.includes(pattern)) markers.push(`/proc/self/mountinfo 含 ${pattern}`)
  }
  for (const key of ['KUBERNETES_SERVICE_HOST', 'container', 'DOCKER_HOST', 'DEVCONTAINER']) {
    if (process.env[key] !== undefined && process.env[key] !== '') markers.push(`环境变量 ${key}`)
  }
  return { container: markers.length > 0, markers: [...new Set(markers)] }
}

/** macOS locale, language order, keyboard and 24-hour preferences. */
async function detectMacLocale() {
  if (platform() !== 'darwin') return {}
  return {
    appleLocale: (await run('defaults', ['read', '-g', 'AppleLocale'])).trim(),
    appleLanguages: (await run('defaults', ['read', '-g', 'AppleLanguages'])).replace(/\s+/g, ' ').trim(),
    force24Hour: (await run('defaults', ['read', '-g', 'AppleICUForce24HourTime'])).trim(),
    timezoneLink: (await run('readlink', ['/etc/localtime'])).trim(),
  }
}

/** Zone names a symlink target may name relative to the zoneinfo root. */
const ZONEINFO_PREFIX = 'zoneinfo/'

/**
 * Read the live system time zone from the OS, not from this process.
 * @returns { zone, link, live }
 */
function readZoneInfo() {
  try {
    const link = readlinkSync('/etc/localtime')
    const at = link.lastIndexOf(ZONEINFO_PREFIX)
    const zone = at === -1 ? '' : link.slice(at + ZONEINFO_PREFIX.length)
    return { zone: /^[A-Za-z]+\/[A-Za-z0-9_+.-]+$/.test(zone) ? zone : '', link, live: zone !== '' }
  } catch {
    return { zone: '', link: '', live: false }
  }
}

/** Country code from a public IP echo (opt-in; the only outbound request). */
async function detectIpLocation() {
  const services = [
    { url: 'https://www.cloudflare.com/cdn-cgi/trace', parse: text => /^loc=([A-Z]{2})$/m.exec(text)?.[1] ?? '' },
    { url: 'https://ipapi.co/country/', parse: text => text.trim().slice(0, 2).toUpperCase() },
  ]
  for (const service of services) {
    try {
      const response = await fetch(service.url, { signal: AbortSignal.timeout(4000) })
      if (!response.ok) continue
      const country = service.parse(await response.text())
      if (/^[A-Z]{2}$/.test(country)) return { country, source: new URL(service.url).host }
    } catch {
      /* try the next service */
    }
  }
  return { country: '', source: '' }
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

/** Country codes whose dominant everyday language is English. */
const ENGLISH_COUNTRIES = new Set(['US', 'GB', 'AU', 'CA', 'NZ', 'IE', 'SG', 'PH', 'IN', 'ZA'])

/** Classify a time zone or a locale region onto the one axis that matters here. */
function zoneSide(zone) {
  if (zone === '') return 'unknown'
  if (zone.startsWith('America/')) return 'us'
  if (zone.startsWith('Asia/Shanghai') || zone.startsWith('Asia/Chongqing') || zone.startsWith('Asia/Urumqi') || zone.startsWith('Asia/Harbin')) return 'cn'
  return 'other'
}

function regionSide(language, region) {
  if (region === 'US') return 'us'
  if (region === 'CN' || region === 'HK' || region === 'TW' || region === 'MO') return 'cn'
  if (language === 'zh') return 'cn'
  if (region === '' && language === '') return 'unknown'
  return 'other'
}

const SIDE_LABEL = { us: '美国', cn: '中国', other: '其他', unknown: '未知' }

/**
 * Build the complete host report.
 * @param options - { includeIp } to allow one public-IP lookup (default false).
 * @returns the report: OS facts, the signal list, and the raw host logit.
 */
export async function detectHostReport(options = {}) {
  const osPlatform = platform()
  const container = detectContainer()
  const zone = readZoneInfo()
  const [software, input, routing, proxyClients, mac] = await Promise.all([
    detectSoftware(), detectInputMethods(), detectRouting(), detectProxyClients(), detectMacLocale(),
  ])
  const llm = detectLlmProviders()
  const ip = options.includeIp === true ? await detectIpLocation() : { country: '', source: '' }

  const signals = []
  const osName = osPlatform === 'darwin' ? 'macOS' : osPlatform === 'win32' ? 'Windows' : osPlatform
  const locale = parseLanguageTag(mac.appleLocale ?? '')
  const primary = parseLanguageTag((mac.appleLanguages ?? '').match(/"?([A-Za-z-]+)"?/)?.[1] ?? '')
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  const liveZone = zone.zone !== '' ? zone.zone : browserZone
  const offset = -new Date().getTimezoneOffset() / 60

  /* ---- dimension: OS family ------------------------------------------- */
  const appleEcosystem = osPlatform === 'darwin' && input.usLayout === true && primary.language === 'en'
  signals.push(signal(
    'host-os', osName, '是否运行 macOS 或 Windows（美国两大操作系统阵营）', 'os',
    appleEcosystem ? 0.5 : osPlatform === 'darwin' || osPlatform === 'win32' ? 0.3 : -0.4,
    `${osPlatform} ${release()} (${arch()})`,
    { extra: { appleEcosystem } },
  ))

  if (container.container) {
    signals.push(signal(
      'docker-disguise', 'Docker/Linux 伪装', '系统声称 Linux，但内核属于容器运行时', 'container', 1.2,
      container.markers.join('；'), { extra: { markers: container.markers } },
    ))
  }

  /* ---- dimension: software mix ---------------------------------------- */
  const usCount = software.us.length
  const cnCount = software.cn.length
  const mixValue = usCount + cnCount === 0
    ? '未发现可识别的中美软件'
    : `${usCount} 个美国软件、${cnCount} 个中国软件（美国占比 ${Math.round(software.usShare * 100)}%）`
  const mixLogit = usCount + cnCount === 0 ? 0 : cnCount === 0 && usCount >= 3 ? 1.1 : cnCount >= 2 && usCount <= cnCount ? -0.9 : 0
  signals.push(signal(
    'software-mix', '软件分布', '中美厂商软件的分布比例（只看"有没有装美国软件"会把混合环境算成美国）', 'software', mixLogit,
    mixValue,
    { extra: { applications: { us: software.us, cn: software.cn }, counts: { usCount, cnCount } } },
  ))

  /* ---- dimension: LLM providers --------------------------------------- */
  const llmLogit = llm.cn.length > 0 ? -0.3 : llm.us.length >= 2 ? 0.6 : llm.us.length === 1 ? 0.4 : 0
  signals.push(signal(
    'llm-mix', '接入的 LLM', '是否接入 claude / chatgpt / ollama 等美国 LLM，以及是否同时用中国厂商', 'llm', llmLogit,
    `美国：${llm.us.length > 0 ? llm.us.slice(0, 4).join('、') : '无'}；中国：${llm.cn.length > 0 ? llm.cn.slice(0, 3).join('、') : '无'}`,
    { extra: { where: llm.where, envKeys: llm.envKeys, counts: { usCount: llm.us.length, cnCount: llm.cn.length } } },
  ))

  /* ---- dimension: proxy / VPN ----------------------------------------- */
  const tunnelDetail = routing.tunnels.map(entry => `${entry.name}(mtu ${entry.mtu || '?'})`).join('、')
  const routeEvidence = [
    routing.defaultOnTunnel ? `默认路由经隧道 ${routing.interfaceName}` : `默认路由经 ${routing.interfaceName || '未知'}`,
    tunnelDetail !== '' ? `隧道网卡 ${tunnelDetail}` : '',
    routing.systemProxies.length > 0 ? `系统代理 ${routing.systemProxies.join('/')}` : '',
    routing.envProxies.length > 0 ? `环境代理 ${routing.envProxies.join('/')}` : '',
  ].filter(Boolean).join('；')
  // The cn-proxy reading outranks a western VPN when both are running: the
  // circumvention client is the more specific fact about who is typing.
  const strongestClient = proxyClients.reduce((best, entry) => (best === null || entry.logit < best.logit ? entry : best), null)

  // A zone/locale override signature: the machine's time zone and its region or
  // input methods disagree. Distinguishing the *direction* matters because a
  // western zone with CJK locale/input is the classic "clock pointed abroad"
  // shape, while a Chinese zone with English locale is ordinary for a US expat.
  const zoneIsUs = zoneSide(liveZone) === 'us'
  const zoneIsCn = zoneSide(liveZone) === 'cn'
  const regionLocale = regionSide(primary.language, primary.region)
  const hasCjkInput = input.cjk.length > 0
  const spoofSignature = (zoneIsUs && (regionLocale === 'cn' || hasCjkInput)) || (zoneIsCn && regionLocale === 'us')

  if (strongestClient !== null) {
    const cnProxy = strongestClient.family === 'cn-proxy'
    // Conditional evidence. "Behind the GFW" is a fact about where the person
    // types from, but it stops being informative the moment the machine shows
    // signs of a deliberate zone/locale override: that is exactly when someone
    // reaches for a circumvention client *and* points their clock at America.
    // Suppressing the term there is what keeps the spoofing case detectable.
    const suppressed = cnProxy && spoofSignature === true
    signals.push(signal(
      'proxy-client', cnProxy ? '中文圈代理客户端' : '代理客户端',
      suppressed
        ? '检测到中文圈翻墙客户端，但本机同时存在时区/区域覆盖特征：该证据按条件化规则不计分'
        : cnProxy
          ? '正在运行中文圈常用的翻墙客户端（Shadowrocket / Clash / Surge…）：这是"人在墙内"的群体证据，方向为负'
          : '正在运行西式 VPN 客户端（WireGuard / NordVPN…）：弱正向证据',
      'proxy',
      suppressed ? 0 : strongestClient.logit,
      `${strongestClient.name}${proxyClients.length > 1 ? ` 等 ${proxyClients.length} 个客户端` : ''}；${routeEvidence}`,
      suppressed
        ? { informational: true, extra: { clients: proxyClients, routing, family: strongestClient.family, suppressed } }
        : { extra: { clients: proxyClients, routing, family: strongestClient.family } },
    ))
  } else if (routing.defaultOnTunnel || routing.systemProxies.length > 0 || routing.envProxies.length > 0) {
    signals.push(signal(
      'proxy-route', '默认路由 / 代理', '流量经隧道或代理转发，但未识别出具体客户端；来源中立，故只给弱正向', 'proxy',
      routing.defaultOnTunnel ? 0.3 : 0.2, routeEvidence, { extra: { routing } },
    ))
  } else if (routing.tunnels.length > 0) {
    signals.push(signal(
      'proxy-route', '隧道网卡（仅记录）', '有隧道网卡但默认路由没走它：iCloud 私密代理等系统服务也这样，故不计分', 'proxy',
      0, routeEvidence, { informational: true, extra: { routing } },
    ))
  } else {
    signals.push(signal('proxy-route', 'VPN / 代理', '未发现隧道或代理', 'proxy', -0.3, '无 VPN、无代理', { extra: { routing } }))
  }

  /* ---- dimension: input methods --------------------------------------- */
  if (input.available === true) {
    const cjkOnly = input.cjk.length > 0 && input.usLayout === false
    const cjkWithUs = input.cjk.length > 0 && input.usLayout === true
    signals.push(signal(
      'input-method', '输入法 / 键盘布局', '启用的输入法是语言习惯的硬证据：只用拼音输入法的人几乎不会是美国人', 'geo-identity',
      cjkOnly ? -1.3 : cjkWithUs ? -0.9 : input.usLayout ? 0.8 : 0,
      input.cjk.length > 0
        ? `含中文输入法：${input.cjk.join('、')}；键盘布局：${input.layouts.join('、') || '未知'}`
        : `无中文输入法；键盘布局：${input.layouts.join('、') || '未知'}`,
      { extra: { input } },
    ))
  } else {
    signals.push(signal('input-method', '输入法 / 键盘布局', '非 macOS，未读取输入法', 'geo-identity', 0, `平台 ${osPlatform}`, { informational: true }))
  }

  /* ---- dimension: locale ---------------------------------------------- */
  const localeIsUs = locale.language === 'en' && locale.region === 'US'
  signals.push(signal(
    'system-locale', '系统语言 / 区域', '系统语言是否为英文、区域是否为美国', 'geo-identity',
    localeIsUs ? 1.2 : locale.language === 'zh' ? -0.8 : 0,
    [mac.appleLocale !== '' ? `AppleLocale=${mac.appleLocale}` : '',
      mac.appleLanguages !== '' ? `AppleLanguages=${mac.appleLanguages}` : '',
      mac.force24Hour !== '' ? `强制24小时制=${mac.force24Hour}` : ''].filter(Boolean).join('；') || '未读取到（非 macOS）',
    { hard: localeIsUs === true, extra: { locale, primary } },
  ))

  /* ---- dimension: time zone ------------------------------------------- */
  signals.push(signal(
    'host-timezone', '主机时区', '时区是否落在美国本土，以及是否与系统区域自洽', 'geo-identity',
    zoneSide(liveZone) === 'us' ? 0.6 : zoneSide(liveZone) === 'cn' ? -0.4 : 0,
    `${liveZone}（UTC${offset >= 0 ? '+' : ''}${offset}）${zone.link !== '' ? `；${zone.link}` : ''}${zone.live === true ? '；实时读取' : ''}`,
    { extra: { zone: liveZone, browserZone } },
  ))

  /* ---- geo identity sides (the coherence term itself is client-side) --- *
   * Only the browser can score cross-source coherence: only it sees the
   * browser's own time zone and language. The host contributes the sides it
   * knows as plain facts, for the browser's coherence check to consume.
   */
  const sides = [
    { name: 'host-timezone', side: zoneSide(liveZone), value: liveZone },
    { name: 'host-locale', side: regionSide(primary.language, primary.region), value: mac.appleLocale ?? '' },
    { name: 'input-method', side: input.cjk.length > 0 ? 'cn' : input.usLayout === true ? 'us' : 'unknown', value: input.cjk.join('、') || input.layouts.join('、') },
  ].filter(entry => entry.side !== 'unknown')

  if (ip.country !== '') {
    const side = ip.country === 'US' ? 'us' : ip.country === 'CN' ? 'cn' : 'other'
    signals.push(signal(
      'ip-country', 'IP 属地', `公网 IP 解析到的国家码（来源 ${ip.source}）`, 'geo-identity',
      ip.country === 'US' ? 0.7 : ip.country === 'CN' ? -0.7 : 0,
      ip.country, { extra: { ip, sides: [...sides, { name: 'ip', side, value: ip.country }] } },
    ))
  }

  const positives = signals.filter(entry => entry.logit > 0 && entry.informational !== true)
  return {
    at: new Date().toISOString(),
    model: 'v2',
    platform: osPlatform,
    os: { platform: osPlatform, release: release(), arch: arch(), hostname: hostname() },
    signals,
    facts: {
      software: { us: software.us, cn: software.cn, usShare: Number(software.usShare.toFixed(3)) },
      input,
      routing: { interfaceName: routing.interfaceName, defaultOnTunnel: routing.defaultOnTunnel, tunnels: routing.tunnels },
      proxyClients,
      llm,
      locale: { appleLocale: mac.appleLocale ?? '', primary },
      zone: { zone: liveZone, browserZone, offset },
      ip,
      sides,
    },
    hostLogit: Number(positives.reduce((sum, entry) => sum + entry.logit, 0).toFixed(3)),
    note: '主机侧 logit 只是参考：分组折叠与跨源比对由客户端评分模型完成。',
  }
}

export default detectHostReport
