/**
 * Host-side "are you American?" detection.
 *
 * Everything here is best-effort and read-only: it inspects this machine's
 * operating system, installed software, environment and network state to
 * produce the signal list the browser half cannot see by itself. It never
 * writes anywhere outside its own cache and never sends anything off-box.
 *
 * The report is a plain JSON object:
 *   { at, platform, os, signals: [{ id, label, note, weight, value, hit, extra? }] }
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

/** A signal row. `hit` is what the client scores; the client re-scores anyway. */
function signal(id, label, note, weight, value, hit, extra) {
  return { id, label, note, weight, value, hit, ...(extra === undefined ? {} : { extra }) }
}

/* ------------------------------------------------------------------ *
 * Installed software from companies whose principal operator is American
 * ------------------------------------------------------------------ */

/** Known application bundles / binaries with their owning company. */
const SOFTWARE_CATALOG = [
  { app: 'Google Chrome.app', cli: 'Google Chrome', company: 'Google（美国）', match: /^google chrome(\.app)?$/i },
  { app: 'Google Chrome Canary.app', company: 'Google（美国）', match: /^google chrome canary(\.app)?$/i },
  { app: 'Arc.app', cli: 'Arc', company: 'The Browser Company（美国）', match: /^arc(\.app)?$/i },
  { app: 'Dia.app', company: 'The Browser Company（美国）', match: /^dia(\.app)?$/i },
  { app: 'Safari.app', company: 'Apple（美国）', match: /^safari(\.app)?$/i, system: true },
  { app: 'Firefox.app', cli: 'firefox', company: 'Mozilla（美国）', match: /^firefox(\.app)?$/i },
  { app: 'Microsoft Edge.app', cli: 'Microsoft Edge', company: 'Microsoft（美国）', match: /^microsoft edge(\.app)?$/i },
  { app: 'Visual Studio Code.app', cli: 'code', company: 'Microsoft（美国）', match: /^visual studio code(\.app)?$/i },
  { app: 'Slack.app', cli: 'Slack', company: 'Salesforce（美国）', match: /^slack(\.app)?$/i },
  { app: 'Discord.app', company: 'Discord（美国）', match: /^discord(\.app)?$/i },
  { app: 'Figma.app', company: 'Figma（美国）', match: /^figma(\.app)?$/i },
  { app: 'Notion.app', company: 'Notion Labs（美国）', match: /^notion(\.app)?$/i },
  { app: 'Spotify.app', company: 'Spotify（总部瑞典，主体在美上市）', match: /^spotify(\.app)?$/i },
  { app: 'Zoom.app', cli: 'zoom.us', company: 'Zoom（美国）', match: /^zoom(\.app)?$/i },
  { app: 'Docker.app', cli: 'docker', company: 'Docker Inc.（美国）', match: /^docker(\.app)?$/i },
  { app: 'Postman.app', company: 'Postman（美国）', match: /^postman(\.app)?$/i },
  { app: 'Obsidian.app', company: 'Obsidian（美国）', match: /^obsidian(\.app)?$/i },
  { app: 'ChatGPT.app', cli: 'chatgpt', company: 'OpenAI（美国）', match: /^chatgpt(\.app)?$/i },
  { app: 'Claude.app', cli: 'claude', company: 'Anthropic（美国）', match: /^claude(\.app)?$/i },
  { app: 'Cursor.app', cli: 'cursor', company: 'Anysphere（美国）', match: /^cursor(\.app)?$/i },
  { app: 'GitHub Desktop.app', company: 'GitHub / Microsoft（美国）', match: /^github desktop(\.app)?$/i },
  { app: 'iTerm.app', company: 'Apple 生态第三方（美国开发者）', match: /^iterm(\.app)?$/i, weak: true },
  { app: 'Xcode.app', company: 'Apple（美国）', match: /^xcode(\.app)?$/i, system: true },
  { app: 'Adobe Photoshop 2024.app', company: 'Adobe（美国）', match: /^adobe photoshop/i },
  { app: 'Notion Calendar.app', company: 'Notion Labs（美国）', match: /^notion calendar(\.app)?$/i },
  { app: 'Telegram.app', company: 'Telegram（总部迪拜，非美国）', match: /^telegram(\.app)?$/i, nonUs: true },
  { app: 'WeChat.app', company: '腾讯（中国）', match: /^wechat(\.app)?$/i, nonUs: true },
  { app: 'QQ.app', company: '腾讯（中国）', match: /^qq(\.app)?$/i, nonUs: true },
  { app: 'DingTalk.app', company: '阿里（中国）', match: /^dingtalk(\.app)?$/i, nonUs: true },
  { app: 'Feishu.app', company: '字节跳动（中国）', match: /^feishu(\.app)?$/i, nonUs: true },
]

/** Extra CLI-only probes (name resolved through PATH). */
const CLI_CATALOG = [
  { cli: 'ollama', company: 'Ollama（美国）' },
  { cli: 'codex', company: 'OpenAI Codex CLI（美国）' },
  { cli: 'gh', company: 'GitHub CLI / Microsoft（美国）' },
  { cli: 'brew', company: 'Homebrew（美国）', weak: true },
  { cli: 'cursor', company: 'Cursor / Anysphere（美国）' },
  { cli: 'docker', company: 'Docker Inc.（美国）' },
  { cli: 'adb', company: 'Google Android Platform Tools（美国）' },
  { cli: 'claude', company: 'Anthropic（美国）' },
]

/** Resolve a binary through PATH without spawning a shell. */
function which(binary) {
  const path = process.env.PATH ?? ''
  for (const dir of path.split(':')) {
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

/** Scan the standard application directories for catalog matches. */
function scanApplications() {
  const roots = ['/Applications', join(homedir(), 'Applications'), '/System/Applications']
  const names = new Set()
  for (const root of roots) {
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
  const hives = [
    ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'reg query'],
    ['HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'reg query'],
  ]
  for (const hive of hives) {
    const target = hive[0]
    const out = await run('reg', ['query', target, '/s', '/v', 'DisplayName'], 6000)
    for (const line of out.split(/\r?\n/)) {
      const match = /DisplayName\s+REG_SZ\s+(.+)$/i.exec(line.trim())
      if (match !== null) names.add(match[1].trim())
    }
  }
  return names
}

/** Detect installed American-company software. */
async function detectSoftware() {
  const found = []
  const names = new Set()

  if (platform() === 'win32') {
    for (const name of await scanWindowsRegistry()) names.add(name)
  } else {
    for (const name of scanApplications()) names.add(name)
  }

  for (const entry of SOFTWARE_CATALOG) {
    const shellName = entry.app.replace(/\.app$/i, '')
    let hitName
    for (const name of names) {
      if (entry.match.test(name) || name.toLowerCase() === entry.app.toLowerCase()) {
        hitName = name
        break
      }
      if (entry.match.test(shellName) && name.toLowerCase().includes(shellName.toLowerCase())) {
        hitName = name
        break
      }
    }
    if (hitName === undefined && entry.cli !== undefined && which(entry.cli) !== undefined) hitName = `${entry.cli}（PATH）`
    if (hitName === undefined) continue
    found.push({ name: entry.app, company: entry.company, where: hitName, weak: entry.weak === true, nonUs: entry.nonUs === true, system: entry.system === true })
  }

  for (const entry of CLI_CATALOG) {
    if (which(entry.cli) === undefined) continue
    if (found.some(item => item.name.toLowerCase().startsWith(entry.cli.toLowerCase()))) continue
    found.push({ name: entry.cli, company: entry.company, where: `${entry.cli}（PATH）`, weak: entry.weak === true, nonUs: false })
  }

  const usApps = found.filter(item => item.nonUs !== true)
  const strong = usApps.filter(item => item.weak !== true)
  return {
    all: found.map(item => `${item.name} — ${item.company}`),
    us: usApps.map(item => `${item.name} — ${item.company}`),
    strongUs: strong.map(item => `${item.name} — ${item.company}`),
    nonUs: found.filter(item => item.nonUs === true).map(item => `${item.name} — ${item.company}`),
  }
}

/* ------------------------------------------------------------------ *
 * LLM / AI provider configuration ("claude", "chatgpt", "ollama", ...)
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
]

const LLM_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OLLAMA_HOST',
  'OLLAMA_MODELS',
  'AZURE_OPENAI_ENDPOINT',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'DEEPSEEK_API_KEY',
]

/** Which LLM providers are configured on this machine. */
function detectLlmProviders() {
  const usProviders = []
  const otherProviders = []
  const where = []

  for (const entry of LLM_DIRS) {
    const full = join(homedir(), entry.path)
    if (!existsSync(full)) continue
    where.push(`~/${entry.path} 存在`)
    if (/DeepSeek|Moonshot|Kimi|Qwen|智谱|Chinese|中国/.test(entry.provider)) otherProviders.push(entry.provider)
    else usProviders.push(entry.provider)
  }

  const envNames = []
  for (const key of LLM_ENV_KEYS) {
    if (process.env[key] === undefined || process.env[key] === '') continue
    envNames.push(key)
    if (key === 'DEEPSEEK_API_KEY') otherProviders.push('DeepSeek API（中国）')
    else usProviders.push(`${key} 已设置`)
  }

  // Ollama's local model registry (still an American project, but the models are not).
  for (const manifest of ['Library/Application Support/Ollama', '.ollama/models']) {
    if (existsSync(join(homedir(), manifest))) envNames.push(manifest)
  }

  for (const candidate of ['Library/Application Support/Claude/claude_desktop_config.json']) {
    const full = join(homedir(), candidate)
    const text = readText(full)
    if (text !== '' && /anthropic|claude/i.test(text)) where.push(`${candidate} 中登记了 Claude`)
  }

  return {
    us: [...new Set(usProviders)],
    other: [...new Set(otherProviders)],
    where,
    envKeys: envNames,
  }
}

/* ------------------------------------------------------------------ *
 * VPN / proxy / network state
 * ------------------------------------------------------------------ */

const TUNNEL_PATTERN = /^(utun|tun|tap|wg|ppp|ipsec|gpd|zt|tailscale|nordlynx|proton)/i

/** Interface names that look like a tunnel, plus environment proxies. */
async function detectVpn() {
  const tunnels = []
  try {
    for (const [name, addresses] of Object.entries(networkInterfaces())) {
      if (addresses === undefined) continue
      if (!TUNNEL_PATTERN.test(name)) continue
      const live = addresses.some(address => address.internal !== true)
      if (live) tunnels.push(name)
    }
  } catch {
    /* ignore */
  }

  const envProxies = []
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'SOCKS_PROXY']) {
    if (process.env[key] !== undefined && process.env[key] !== '') envProxies.push(`${key}=${process.env[key]}`)
  }

  const systemProxies = []
  if (platform() === 'darwin') {
    const out = await run('scutil', ['--proxy'], 2500)
    for (const line of out.split(/\r?\n/)) {
      const match = /^\s*(HTTPEnable|HTTPSEnable|SOCKSEnable|ProxyAutoConfigEnable|HTTPProxy|HTTPSProxy|SOCKSProxy)\s*:\s*(.+)$/.exec(line)
      if (match === null) continue
      const [, key, value] = match
      if (/Enable$/.test(key)) {
        if (value.trim() === '1') systemProxies.push(key.replace(/Enable$/, ''))
      } else if (/Proxy$/.test(key)) {
        systemProxies.push(`${key}=${value.trim()}`)
      }
    }
  }

  return { tunnels, envProxies, systemProxies }
}

/* ------------------------------------------------------------------ *
 * Operating system and "is this Linux actually a container" detection
 * ------------------------------------------------------------------ */

/** Read /proc/1/cgroup and friends to recognize a container. */
function detectContainer() {
  if (platform() !== 'linux') return { container: false, markers: [], hostOs: platform() }
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
  return { container: markers.length > 0, markers: [...new Set(markers)], hostOs: markers.length > 0 ? 'container-on-linux' : 'linux' }
}

/** macOS locale preferences (System Settings language + region). */
async function detectMacLocale() {
  if (platform() !== 'darwin') return {}
  const appleLocale = (await run('defaults', ['read', '-g', 'AppleLocale'])).trim()
  const appleLanguages = (await run('defaults', ['read', '-g', 'AppleLanguages'])).replace(/\s+/g, ' ').trim()
  const clock = (await run('defaults', ['read', '-g', 'AppleICUForce24HourTime'])).trim()
  const timezone = (await run('readlink', ['/etc/localtime'])).trim()
  return { appleLocale, appleLanguages, force24Hour: clock, timezoneLink: timezone }
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

/** Build the complete host report. Safe to call anytime; may take ~1s. */
export async function detectHostReport() {
  const osPlatform = platform()
  const container = detectContainer()
  const [software, mac, vpn] = [await detectSoftware(), await detectMacLocale(), await detectVpn()]
  const llm = detectLlmProviders()

  const signals = []
  const usApps = software.us
  const strongApps = software.strongUs

  signals.push(signal(
    'host-os',
    osPlatform === 'darwin' ? 'macOS' : osPlatform === 'win32' ? 'Windows' : osPlatform,
    '是否运行 macOS 或 Windows（美国两大操作系统阵营）',
    osPlatform === 'darwin' || osPlatform === 'win32' ? 8 : 0,
    `${osPlatform} ${release()} (${arch()})`,
    osPlatform === 'darwin' || osPlatform === 'win32',
  ))

  if (container.container) {
    signals.push(signal(
      'docker-disguise',
      'Docker/Linux 伪装',
      '系统声称是 Linux，但内核属于容器运行时',
      18,
      container.markers.join('；'),
      true,
      { markers: container.markers },
    ))
  } else if (osPlatform === 'linux') {
    signals.push(signal(
      'docker-disguise',
      'Docker/Linux 伪装',
      '系统声称是 Linux，但内核属于容器运行时',
      18,
      '未发现容器标记（请自证不是 Linux）',
      false,
    ))
  }

  signals.push(signal(
    'us-software',
    '美国公司出品的软件',
    '电脑中已安装由美国经营主体开发的软件',
    strongApps.length >= 3 ? 18 : strongApps.length >= 1 ? 12 : 0,
    strongApps.length > 0 ? `${strongApps.length} 个：${strongApps.slice(0, 6).join('、')}${strongApps.length > 6 ? ' …' : ''}` : '未发现',
    strongApps.length > 0,
    { applications: usApps, nonUs: software.nonUs },
  ))

  signals.push(signal(
    'us-llm',
    '接入美国 LLM',
    '是否接入 claude / chatgpt / ollama 等美国 LLM',
    llm.us.length >= 2 ? 14 : llm.us.length === 1 ? 9 : 0,
    llm.us.length > 0 ? llm.us.slice(0, 5).join('、') : '未发现',
    llm.us.length > 0,
    { other: llm.other, where: llm.where, envKeys: llm.envKeys },
  ))

  signals.push(signal(
    'vpn',
    'VPN / 代理',
    '是否开启 VPN 或系统代理（用来伪造 IP 属地）',
    vpn.tunnels.length > 0 ? 16 : vpn.envProxies.length > 0 || vpn.systemProxies.length > 0 ? 12 : 0,
    [
      vpn.tunnels.length > 0 ? `隧道网卡 ${vpn.tunnels.join('、')}` : '',
      vpn.envProxies.length > 0 ? `环境变量 ${vpn.envProxies.join('、')}` : '',
      vpn.systemProxies.length > 0 ? `系统代理 ${vpn.systemProxies.join('、')}` : '',
    ].filter(Boolean).join('；') || '未发现 VPN 或代理',
    vpn.tunnels.length > 0 || vpn.envProxies.length > 0 || vpn.systemProxies.length > 0,
  ))

  const appleLocale = mac.appleLocale ?? ''
  const localeLooksUs = /^(en[-_]US|en[-_]CA)/i.test(appleLocale)
  signals.push(signal(
    'system-locale',
    '系统语言 / 区域',
    '系统语言是否为英文、区域是否为美国',
    localeLooksUs ? 16 : 0,
    [appleLocale !== '' ? `AppleLocale=${appleLocale}` : '', mac.appleLanguages !== '' ? `AppleLanguages=${mac.appleLanguages}` : '',
      mac.force24Hour !== '' ? `强制24小时制=${mac.force24Hour}` : ''].filter(Boolean).join('；') || '未读取到（非 macOS）',
    localeLooksUs,
  ))

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  const offset = -new Date().getTimezoneOffset() / 60
  signals.push(signal(
    'host-timezone',
    '主机时区',
    '时区代码是否落在美国本土时区（UTC-4 ~ UTC-10）',
    timezone.startsWith('America/') ? 10 : 0,
    `${timezone}（UTC${offset >= 0 ? '+' : ''}${offset}）${mac.timezoneLink !== '' ? `；${mac.timezoneLink}` : ''}`,
    timezone.startsWith('America/'),
  ))

  const user = (() => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
  })()

  return {
    at: new Date().toISOString(),
    platform: osPlatform,
    os: { platform: osPlatform, release: release(), arch: arch(), hostname: hostname(), user },
    signals,
    summary: {
      usSoftwareCount: strongApps.length,
      usLlmCount: llm.us.length,
      vpn: vpn.tunnels.length > 0 || vpn.envProxies.length > 0 || vpn.systemProxies.length > 0,
      container: container.container,
    },
  }
}

export default detectHostReport
