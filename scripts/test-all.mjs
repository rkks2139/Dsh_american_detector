#!/usr/bin/env node
/**
 * Build the client bundle, then run every headless smoke test.
 *
 * Usage: node scripts/test-all.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const steps = ['build-client.mjs', 'test-client.mjs', 'test-gate.mjs', 'calibrate.mjs']

for (const step of steps) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', step)], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\ntest-all: ${step} failed`)
    process.exit(result.status ?? 1)
  }
}

console.log('\ntest-all: everything passed')
