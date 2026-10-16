#!/usr/bin/env node
/**
 * Calibration harness for the log-odds model.
 *
 * The threshold in src/client/score.js cannot be derived from the coefficients
 * (the signals correlate, and the prior is not 50/50), so it is calibrated
 * against archetypes: each profile below is a hand-built signal set with the
 * decision it must produce. Run this after touching any coefficient.
 *
 *   node scripts/calibrate.mjs            # table + pass/fail
 *   node scripts/calibrate.mjs --verbose  # per-signal breakdown per profile
 *
 * Profiles marked `regression` describe machines the detector is expected to
 * see; the rest are adversarial or edge cases. All host profiles pass
 * `includeIp` only where the IP lookup is part of the scenario.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectHostReport } from '../src/host/detect.js'
import { THRESHOLD_LOGIT, scoreSignals } from '../src/client/score.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const verbose = process.argv.includes('--verbose')

/** Build one signal row compactly. */
const row = (id, label, group, logit, value = '', extra = {}) => ({ id, label, note: `${label}（合成画像）`, group, logit, value, ...extra })

/** A browser row set for a given UI language / zone / vendor. */
function browser(language, zone, vendorLogit = 0.5) {
  return [
    row('browser-language', '浏览器语言', 'ui-language', language === 'en-US' ? 1.3 : language.startsWith('en') ? 0.9 : -1.2, language),
    row('browser-timezone', '浏览器时区', 'geo-identity', zone.startsWith('America/') ? 0.7 : zone.startsWith('Asia/') ? -0.4 : 0, zone),
    row('browser-12h-clock', '时间格式', 'ui-language', language.startsWith('en') ? 0.2 : 0, '12 小时制'),
    row('browser-vendor', '浏览器出品方', 'browser-vendor', vendorLogit, 'Google Chrome — Google（美国）'),
    row('page-language', '页面语言', 'ui-language', language.startsWith('en') ? 0.4 : -0.4, language.split('-')[0]),
  ]
}

/**
 * A host row set built the way src/host/detect.js builds one for a given
 * geo-identity scenario, so the calibration exercises the real conditional
 * rules (coherence polarity, spoof signature, proxy suppression).
 *
 * @param geo - one of 'cn', 'us', 'us-spoofed', 'cn-zone-us-region'.
 */
function host({
  osLogit = 0.3,
  softwareLogit = 0,
  softwareValue = '4 个美国软件、4 个中国软件',
  llmLogit = 0,
  llmValue = '美国：Claude、ChatGPT；中国：DeepSeek',
  /** Raw client family as src/host/detect.js recognizes it. */
  proxyFamily = null,
  proxyValue = '未发现隧道或代理',
  geo = 'cn',
} = {}) {
  const geoFacts = {
    cn: {
      side: 'cn', zone: 'Asia/Shanghai', region: 'CN', input: '中文',
      rows: { input: -0.78, locale: -0.8, zone: -0.4, coherence: -1.5 },
    },
    us: {
      side: 'us', zone: 'America/Los_Angeles', region: 'US', input: 'US',
      rows: { input: 0.8, locale: 1.2, zone: 0.6, coherence: 2.0 },
    },
    /** Clock pointed at America while the person and input methods stay Chinese. */
    'us-spoofed': {
      side: 'us', zone: 'America/Los_Angeles', region: 'CN', input: '中文', spoof: true,
      rows: { input: -0.78, locale: -0.8, zone: 0.6, coherence: 1.8 },
    },
    /** Chinese clock, American region: the expat / student shape. */
    'cn-zone-us-region': {
      side: 'us', zone: 'Asia/Shanghai', region: 'US', input: '中文', spoof: true,
      rows: { input: -0.78, locale: 1.2, zone: -0.4, coherence: 1.8 },
    },
  }[geo]
  const describe = `主机时区=${geoFacts.zone}；系统区域=${geoFacts.region}；输入法=${geoFacts.input}`
  const proxyLogit = proxyFamily === 'cn-proxy' ? -1.6 : proxyFamily === 'western-vpn' ? 0.4 : 0
  const suppressed = proxyFamily === 'cn-proxy' && geoFacts.spoof === true
  return [
    row('host-os', 'macOS', 'os', osLogit, 'darwin 25.5.0'),
    row('software-mix', '软件分布', 'software', softwareLogit, softwareValue),
    row('llm-mix', '接入的 LLM', 'llm', llmLogit, llmValue),
    proxyFamily === null
      ? row('proxy-route', 'VPN / 代理', 'proxy', -0.3, proxyValue)
      : suppressed
        ? row('proxy-client', '中文圈代理客户端', 'proxy', 0, `${proxyValue}（伪造特征存在，按条件化规则不计分）`, { informational: true })
        : row('proxy-client', '代理客户端', 'proxy', proxyLogit, proxyValue),
    row('input-method', '输入法 / 键盘布局', 'geo-identity', geoFacts.rows.input, describe),
    row('system-locale', '系统语言 / 区域', 'geo-identity', geoFacts.rows.locale, describe),
    row('host-timezone', '主机时区', 'geo-identity', geoFacts.rows.zone, describe),
    row('coherence', '跨源一致性', 'geo-identity', geoFacts.rows.coherence, describe),
  ]
}

/** The archetypes. `expect` is the required `american` value. */
const PROFILES = [
  {
    name: '上海中文用户 + Shadowrocket（本机画像）',
    expect: false,
    regression: true,
    signals: [...browser('zh-CN', 'Asia/Shanghai'), ...host({
      softwareLogit: 0, softwareValue: '7 个美国软件、3 个中国软件（美国占比 70%）',
      llmLogit: 0.6, llmValue: '美国：Claude、ChatGPT、Ollama；中国：无',
      proxyFamily: 'cn-proxy', proxyValue: 'Shadowrocket / Shadowsocks；默认路由经隧道 utun4',
      geo: 'cn',
    })],
  },
  {
    name: '上海中文用户，无代理',
    expect: false,
    signals: [...browser('zh-CN', 'Asia/Shanghai'), ...host({
      proxyValue: '无 VPN、无代理', geo: 'cn',
    })],
  },
  {
    name: '美西英文用户（纯美式环境）',
    expect: true,
    regression: true,
    signals: [...browser('en-US', 'America/Los_Angeles'), ...host({
      osLogit: 0.5, softwareLogit: 1.1, softwareValue: '12 个美国软件、0 个中国软件',
      llmLogit: 0.6, proxyValue: '无 VPN、无代理', geo: 'us',
    })],
  },
  {
    name: '美东英文用户 + 商业 VPN',
    expect: true,
    signals: [...browser('en-US', 'America/New_York'), ...host({
      osLogit: 0.3, softwareLogit: 1.1, softwareValue: '9 个美国软件、0 个中国软件',
      llmLogit: 0.4, proxyFamily: 'western-vpn', proxyValue: 'NordVPN', geo: 'us',
    })],
  },
  {
    name: '中文系统 + 英文浏览器（改过浏览器语言）',
    expect: false,
    signals: [...browser('en-US', 'America/Los_Angeles'), ...host({
      softwareLogit: -0.9, softwareValue: '3 个美国软件、6 个中国软件',
      llmLogit: -0.3, llmValue: '美国：Claude；中国：DeepSeek、Kimi',
      proxyFamily: 'cn-proxy', proxyValue: 'ClashX', geo: 'cn',
    })],
  },
  {
    name: '中文系统 + 伪造美国时区 + 英文浏览器',
    expect: true,
    signals: [...browser('en-US', 'America/Los_Angeles'), ...host({
      softwareLogit: -0.9, softwareValue: '3 个美国软件、6 个中国软件',
      llmLogit: -0.3, proxyFamily: 'cn-proxy', proxyValue: 'Surge', geo: 'us-spoofed',
    })],
  },
  {
    name: '在沪美国侨民（英文系统 + 中文输入法 + 上海时区）',
    expect: true,
    signals: [...browser('en-US', 'Asia/Shanghai'), ...host({
      osLogit: 0.3, softwareLogit: 0, softwareValue: '6 个美国软件、2 个中国软件',
      llmLogit: 0.6, proxyFamily: 'western-vpn', proxyValue: 'WireGuard（公司 VPN）', geo: 'cn-zone-us-region',
    })],
  },
  {
    name: '在美中国留学生（中文系统 + 美国时区 + 中文输入法）',
    expect: false,
    signals: [...browser('zh-CN', 'America/Los_Angeles'), ...host({
      osLogit: 0.3, softwareLogit: 0, softwareValue: '5 个美国软件、4 个中国软件',
      llmLogit: -0.3, llmValue: '美国：Claude；中国：Kimi',
      proxyValue: '无 VPN、无代理', geo: 'cn-zone-us-region',
    })],
  },
  {
    name: 'Linux 服务器 / Docker 伪装成桌面',
    expect: false,
    signals: [
      ...browser('zh-CN', 'Asia/Shanghai'),
      row('host-os', 'Linux', 'os', -0.4, 'linux 6.8.0'),
      row('docker-disguise', 'Docker/Linux 伪装', 'container', 1.2, '/.dockerenv 存在；cgroup 含 docker'),
      ...host({ geo: 'cn' }),
    ],
  },
  {
    name: '极简环境（什么证据都没有）',
    expect: false,
    signals: [
      row('browser-language', '浏览器语言', 'ui-language', 0, 'fr-FR'),
      row('browser-timezone', '浏览器时区', 'geo-identity', 0, 'Europe/Paris'),
      row('browser-vendor', '浏览器出品方', 'browser-vendor', 0, '未能识别内核'),
      row('host-os', 'Windows', 'os', 0.3, 'win32 10.0'),
      row('host-env', '主机环境（仅记录）', 'meta', 0, 'unknown', { informational: true }),
    ],
  },
]

/** Score every profile and report. */
const results = []
let failures = 0
for (const profile of PROFILES) {
  const scored = scoreSignals(profile.signals)
  const ok = scored.american === profile.expect
  if (!ok) failures += 1
  results.push({ profile, scored, ok })
  const verdict = scored.american ? '美国用户' : '非美国用户'
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${profile.name}`)
  console.log(`        判定=${verdict}（期望 ${profile.expect ? '美国用户' : '非美国用户'}）  logit=${scored.total.toFixed(2)} / ${scored.threshold}  正向=${scored.proSum.toFixed(2)} 反向=${scored.conSum.toFixed(2)}  折叠=${scored.foldedCount}`)
  if (scored.reasons.length > 0) console.log(`        正向依据：${scored.reasons.join('、')}`)
  if (scored.counterReasons.length > 0) console.log(`        反向依据：${scored.counterReasons.join('、')}`)
  if (verbose) {
    for (const signal of scored.signals) {
      if (signal.informational === true) continue
      const mark = signal.demoted === true ? 'fold' : signal.logit > 0 ? ' +  ' : signal.logit < 0 ? ' -  ' : ' 0  '
      console.log(`          ${mark} ${String(signal.logit).padStart(5)} ${String(signal.group).padEnd(14)} ${signal.id}`)
    }
  }
  console.log('')
}

const margins = results.map(entry => ({
  name: entry.profile.name,
  margin: entry.profile.expect ? entry.scored.total - THRESHOLD_LOGIT : THRESHOLD_LOGIT - entry.scored.total,
}))
const tightest = margins.reduce((worst, entry) => (worst === null || entry.margin < worst.margin ? entry : worst), null)

console.log(`阈值 ${THRESHOLD_LOGIT}，画像 ${PROFILES.length} 个，失败 ${failures} 个`)
console.log(`最小裕度：${tightest.name}（${tightest.margin.toFixed(2)}）`)
console.log(`本机实测画像：${PROFILES.filter(profile => profile.regression === true).map(profile => profile.name).join('；')}`)

if (process.argv.includes('--live')) {
  const report = await detectHostReport()
  console.log(`\n实时主机扫描（includeIp=false）：hostLogit=${report.hostLogit}`)
  for (const signal of report.signals) {
    console.log(`  ${signal.informational === true ? 'info' : String(signal.logit).padStart(5)} ${String(signal.group).padEnd(14)} ${signal.id.padEnd(16)} ${String(signal.value).slice(0, 80)}`)
  }
}

if (failures > 0) {
  console.error(`\ncalibrate: ${failures} 个画像判定错误——调系数或阈值，不要改画像。`)
  process.exit(1)
}
console.log('\ncalibrate: 全部画像通过')
