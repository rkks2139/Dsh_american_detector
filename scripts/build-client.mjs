#!/usr/bin/env node
/**
 * Build src/client/*.js into the closure-factory browser bundle the DSH client
 * module table loads: lib/client.js calling window.__ModuleLoader__.load().
 *
 * The client sources are dependency-free ESM (browser globals only), so this
 * resolves relative imports recursively, rewrites them to the factory-local
 * require, and concatenates one CJS body. No bundler dependency, no install.
 *
 * Usage: node scripts/build-client.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const entry = join(root, 'src/client/index.js')
const outFile = join(root, 'lib/client.js')

const ID = 'dsh-american-detector'
const IMPORT_RE = /^\s*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))\s+from\s+(['"])([^'"]+)\5\s*;?\s*$/gm
const EXPORT_DEFAULT_RE = /^\s*export\s+default\s+/gm
const EXPORT_DECL_RE = /^\s*export\s+(const|let|var|function|async function|class)\s+([\w$]+)/gm
const EXPORT_LIST_RE = /^\s*export\s*\{[^}]*\}\s*;?\s*$/gm

const modules = new Map()

/** Recursively read one module and its relative dependencies. */
function collect(file) {
  const path = resolve(file)
  if (modules.has(path)) return
  let source = readFileSync(path, 'utf8')
  const deps = []
  const exported = []
  // Modules wrap their bodies in a factory, so an imported name can never
  // collide with a sibling top-level declaration of the same name.
  const moduleRef = `__mod[${JSON.stringify(relative(root, path).split('\\').join('/'))}]`
  modules.set(path, { source: null, deps, exported, moduleRef })

  source = source.replace(IMPORT_RE, (match, _defaultWithBraces, named, namespace, defaultName, _quote, spec) => {
    if (!spec.startsWith('.')) throw new Error(`build-client: bare import "${spec}" in ${relative(root, path)} is not supported`)
    const target = resolve(dirname(path), spec)
    collect(target)
    deps.push({ target, named, namespace, defaultName })
    const ref = `__mod[${JSON.stringify(relative(root, target).split('\\').join('/'))}]`
    const names = (named ?? '').split(',').map(part => part.trim()).filter(Boolean)
    // `let`, not `const`: one module may import several times and a second
    // declaration in the same scope would be a syntax error.
    const bindings = []
    if (defaultName !== undefined) bindings.push(`${defaultName} = ${ref}.default ?? ${ref}`)
    if (namespace !== undefined) bindings.push(`${namespace} = ${ref}`)
    if (names.length > 0) bindings.push(`{ ${names.join(', ')} } = ${ref}`)
    return `let ${bindings.join(', ')};`
  })

  source = source.replace(EXPORT_DEFAULT_RE, () => {
    exported.push('default_')
    return ' const default_ = '
  })
  source = source.replace(EXPORT_DECL_RE, (match, keyword, declared) => {
    exported.push(declared)
    return ` ${keyword} ${declared}`
  })
  source = source.replace(EXPORT_LIST_RE, '')
  const record = modules.get(path)
  record.source = source
  record.exported = exported
}

collect(entry)

const order = []
const visiting = new Set()
function emit(path) {
  if (order.includes(path)) return
  if (visiting.has(path)) throw new Error(`build-client: import cycle through ${relative(root, path)}`)
  visiting.add(path)
  for (const dep of modules.get(path).deps) emit(dep.target)
  visiting.delete(path)
  order.push(path)
}
emit(resolve(entry))

const body = order.map((path) => {
  const { source, exported, moduleRef } = modules.get(path)
  const names = [...new Set(exported)]
  return [
    `// ---- ${relative(root, path).split('\\').join('/')} ----`,
    `${moduleRef} = (() => {`,
    source.trim().replace(/^/gm, '  '),
    `  return { ${names.join(', ')} };`,
    `})();`,
  ].join('\n')
}).join('\n\n')

const bundle = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const __mod = {};
${body.replace(/^/gm, '    ')}
    const entry = __mod[${JSON.stringify(relative(root, entry).split('\\').join('/'))}];
    exports.name = entry.name;
    exports.inject = entry.inject;
    exports.apply = entry.apply;
    exports.default = { name: entry.name, inject: entry.inject, apply: entry.apply };
    return module.exports;
  },
});
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, bundle)
const bytes = Buffer.byteLength(bundle)
console.log(`build-client: wrote ${relative(root, outFile)} (${bytes} bytes, ${order.length} modules)`)
