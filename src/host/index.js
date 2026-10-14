/**
 * dsh-american-detector — host half.
 *
 * Answers "is this machine operated by an American user?" over HTTP for the
 * browser half, which cannot read the operating system, the installed
 * applications, or the network adapters by itself.
 *
 * Routes (prefix /api/american-detector):
 *   GET /api/american-detector/report   -> the host report as JSON (60s cache)
 *   GET /api/american-detector/refresh  -> drop the cache and rescan
 *
 * The detection itself lives in ./detect.js and is strictly read-only.
 */
import { detectHostReport } from './detect.js'

/** Plugin name shown in the Loader tree. */
export const name = 'american-detector'

/** The Web profile always supplies the HTTP carrier. */
export const inject = ['webServer']

const PREFIX = '/api/american-detector'
/** Cache lifetime of one report: the expensive parts (app scan, registry) run rarely. */
const REPORT_TTL_MS = 60_000

/**
 * Mount the report routes.
 * @param ctx - host context carrying `webServer`.
 */
export function apply(ctx) {
  let cached = null
  let cachedAt = 0
  let inflight = null

  const scan = () => {
    if (cached !== null && Date.now() - cachedAt < REPORT_TTL_MS) return Promise.resolve(cached)
    if (inflight !== null) return inflight
    inflight = detectHostReport()
      .then((value) => {
        cached = value
        cachedAt = Date.now()
        return value
      })
      .catch((error) => {
        ctx.logger?.warn?.(`american-detector: host scan failed: ${String(error)}`)
        return { at: new Date().toISOString(), platform: 'unknown', signals: [], error: String(error) }
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  const respond = (res, status, body) => {
    const text = JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    })
    res.end(text)
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: (req, res) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' })
          res.end('{"error":"method not allowed"}')
          return
        }
        if (path === `${PREFIX}/refresh`) cached = null
        else if (path !== `${PREFIX}/report`) {
          respond(res, 404, { error: 'not found', report: `${PREFIX}/report` })
          return
        }
        void scan().then((value) => {
          if (req.method === 'HEAD') {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end()
            return
          }
          respond(res, 200, value)
        })
      },
    })
    return dispose
  }, 'american-detector: report route')

  ctx.logger?.info?.('american-detector: 主机侧扫描已就位，正在盯你是不是美国人')
}

export default { name, inject, apply }
