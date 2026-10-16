#!/usr/bin/env node
/**
 * Dry-run the whole v2 pipeline on this machine: build the browser-side rows
 * the way src/client/browser-signals.js would for a given UI language, merge
 * the live host report, and print the scorecard.
 *
 * This is the quickest way to answer "what would it decide right now" without
 * opening the GUI, and to see which term moved the needle.
 *
 *   node scripts/dryrun.mjs                 # zh-CN browser (this machine)
 *   node scripts/dryrun.mjs --lang en-US --zone America/Los_Angeles
 *   node scripts/dryrun.mjs --ip            # allow the one public-IP lookup
 */
import { detectHostReport } from '../src/host/detect.js'
import { scoreSignals } from '../src/client/score.js'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1] ?? fallback
}

const language = flag('lang', 'zh-CN')
const zone = flag('zone', 'Asia/Shanghai')
const includeIp = argv.includes('--ip')

const report = await detectHostReport({ includeIp })

/** Mirror of the browser collector's coherence block, without a DOM. */
function browserRows(report, language, zone) {
  const primary = { language: language.split('-')[0].toLowerCase(), region: (language.split('-')[1] ?? '').toUpperCase() }
  const zoneSide = value => (value === '' ? 'unknown'
    : value.startsWith('America/') || value.startsWith('Pacific/Honolulu') ? 'us'
      : /^Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Macau|Hong_Kong|Taipei)$/.test(value) ? 'cn' : 'other')
  const regionSide = (lang, region) => (region === 'US' ? 'us'
    : region === 'CN' || region === 'HK' || region === 'TW' || region === 'MO' ? 'cn'
      : lang === 'zh' ? 'cn' : region === '' && lang === '' ? 'unknown' : 'other')

  const facts = report.facts
  const ipSide = facts.ip?.country === '' || facts.ip?.country === undefined ? 'unknown'
    : facts.ip.country === 'US' ? 'us' : facts.ip.country === 'CN' ? 'cn' : 'other'
  const sides = [
    { name: '浏览器时区', side: zoneSide(zone), value: zone },
    { name: '浏览器语言', side: regionSide(primary.language, primary.region), value: language },
    ...(Array.isArray(facts.sides) ? facts.sides.map(entry => ({
      name: { 'host-timezone': '主机时区', 'host-locale': '系统区域', 'input-method': '输入法', ip: 'IP 属地' }[entry.name] ?? entry.name,
      side: entry.side,
      value: entry.value,
    })) : []),
    ...(ipSide === 'unknown' ? [] : [{ name: 'IP 属地', side: ipSide, value: facts.ip?.country ?? '' }]),
  ].filter(entry => entry.side !== 'unknown')

  const us = sides.filter(entry => entry.side === 'us')
  const cn = sides.filter(entry => entry.side === 'cn')
  const hasCjkInput = (facts.sides ?? []).some(entry => entry.name === 'input-method' && entry.side === 'cn')
  const spoof = (zoneSide(zone) === 'us' && (facts.locale?.primary?.language === 'zh' || hasCjkInput))
    || (zoneSide(zone) === 'cn' && facts.locale?.primary?.region === 'US')
  const label = { us: '美国', cn: '中国', other: '其他', unknown: '未知' }
  const describe = sides.map(entry => `${entry.name}=${label[entry.side]}`).join('；')

  let logit = 0
  let note = '来源不足或不一致，无定论'
  let informational = true
  let hard = false
  if (us.length > 0 && cn.length === 0 && sides.length >= 3) {
    logit = 2.0; note = '全部独立来源指向美国'; informational = false; hard = true
  } else if (spoof) {
    logit = 1.8; note = '有来源指向美国、有来源指向中文圈：覆盖特征'; informational = false
  } else if (us.length > 0 && cn.length > 0) {
    logit = 1.0; note = '部分来源指向美国、部分指向中国'; informational = false
  } else if (cn.length >= 2 && us.length === 0) {
    logit = -1.5; note = '多个来源一致指向中文圈'; informational = false
  }

  const rows = [
    { id: 'browser-language', label: '浏览器语言', note: '浏览器首选语言', group: 'ui-language',
      logit: language === 'en-US' ? 1.3 : language.startsWith('en') ? 0.9 : language.startsWith('zh') ? -1.2 : 0, value: language },
    { id: 'browser-timezone', label: '浏览器时区', note: '浏览器时区代码', group: 'geo-identity',
      logit: zoneSide(zone) === 'us' ? 0.7 : zoneSide(zone) === 'cn' ? -0.4 : 0, value: zone },
    { id: 'browser-vendor', label: '浏览器出品方', note: '浏览器出品方', group: 'browser-vendor', logit: 0.5, value: 'Google Chrome — Google（美国）' },
    { id: 'coherence', label: spoof ? '跨源一致性（伪造特征）' : '跨源一致性', note, group: 'geo-identity', logit, informational, hard, value: describe },
  ]
  return rows
}

const rows = [...browserRows(report, language, zone), ...report.signals]
const verdict = scoreSignals(rows)

console.log(`浏览器语言=${language}  浏览器时区=${zone}  IP 比对=${includeIp ? '开' : '关'}`)
console.log(`判定：${verdict.american ? '美国用户（会弹窗）' : '非美国用户（不弹窗）'}   logit=${verdict.total} / ${verdict.threshold}`)
console.log(`正向 ${verdict.proSum}（${verdict.proCount} 项）  反向 ${verdict.conSum}（${verdict.conCount} 项）  折叠 ${verdict.foldedCount} 项`)
console.log('')
for (const signal of verdict.signals) {
  const mark = signal.informational === true ? 'info' : signal.demoted === true ? 'fold' : signal.logit > 0 ? ' +  ' : signal.logit < 0 ? ' -  ' : ' 0  '
  console.log(`${mark} ${String(signal.logit).padStart(5)}  ${String(signal.group).padEnd(13)} ${signal.id.padEnd(17)} ${String(signal.value).slice(0, 78)}`)
}
