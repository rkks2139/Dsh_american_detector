#!/usr/bin/env node
/**
 * Install this plugin bundle into a DSH profile.
 *
 * Preferred path: `dsh plugin --profile <name> add file:<this package>`, which
 * lets the official plugin manager resolve and register the bundle. This
 * machine has no pnpm, so the fallback links the package into the profile's
 * own node_modules and appends it to `dsh.profile.bundles` directly — the two
 * things pnpm and the plugin manager would have done.
 *
 * Usage:
 *   node scripts/install.mjs [--profile web] [--uninstall]
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const PACKAGE = manifest.name

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1] ?? fallback
}
const profileName = flag('profile', 'web')
const uninstall = argv.includes('--uninstall')

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', profileName)
const profileManifestPath = join(profileDir, 'package.json')
const linkPath = join(profileDir, 'node_modules', PACKAGE)

if (!existsSync(profileManifestPath)) {
  console.error(`install: no profile at ${profileDir}`)
  console.error('install: create it first, e.g.  dsh --profile ' + profileName + ' --from-default-profile web')
  process.exit(1)
}

const profile = JSON.parse(readFileSync(profileManifestPath, 'utf8'))
profile.dependencies ??= {}
profile.dsh ??= {}
profile.dsh.profile ??= {}
profile.dsh.profile.bundles ??= []

const bundles = profile.dsh.profile.bundles
const listed = bundles.includes(PACKAGE)

if (uninstall) {
  if (listed) profile.dsh.profile.bundles = bundles.filter(name => name !== PACKAGE)
  delete profile.dependencies[PACKAGE]
  writeFileSync(profileManifestPath, `${JSON.stringify(profile, null, 2)}\n`)
  try {
    if (lstatSync(linkPath).isSymbolicLink()) rmSync(linkPath)
  } catch {
    /* nothing linked */
  }
  console.log(`install: removed ${PACKAGE} from profile "${profileName}"`)
  console.log('install: restart `dsh web` (or let HMR reload) to drop the plugin')
  process.exit(0)
}

if (existsSync(linkPath)) {
  try {
    if (lstatSync(linkPath).isSymbolicLink()) rmSync(linkPath)
  } catch {
    /* replace below */
  }
}
mkdirSync(dirname(linkPath), { recursive: true })
symlinkSync(root, linkPath, 'dir')

if (!listed) profile.dsh.profile.bundles = [...bundles, PACKAGE]
profile.dependencies[PACKAGE] = `link:${root}`
writeFileSync(profileManifestPath, `${JSON.stringify(profile, null, 2)}\n`)

console.log(`install: linked ${root}`)
console.log(`install:         -> ${linkPath}`)
console.log(`install: profile "${profileName}" bundles: ${profile.dsh.profile.bundles.join(', ')}`)
console.log('')
console.log('Next: refresh http://127.0.0.1:3080 in the browser.')
console.log('Probe: curl -s http://127.0.0.1:3080/api/american-detector/report | head -c 400')
console.log('Force the prank for testing: http://127.0.0.1:3080/?dsh-ban=1')
