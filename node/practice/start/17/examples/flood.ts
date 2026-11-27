// Promise.all 一次發出全部 vs 限制同時 5 個：node examples/flood.ts
import { createServer } from 'node:http'
import { once } from 'node:events'

let active = 0, max = 0
const server = createServer((req, res) => {
  active++; max = Math.max(max, active)
  setTimeout(() => { active--; res.end('{"stock":1}') }, 50)
}).listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const ids = Array.from({ length: 200 }, (_, i) => i + 1)
const get = async (id: number) => (await fetch(`${base}/stock/${id}`)).json()

async function measure(label: string, run: () => Promise<PromiseSettledResult<unknown>[]>) {
  max = 0
  const t0 = Date.now()
  const results = await run()
  const failed = results.filter(r => r.status === 'rejected')
  const why = failed.length ? `（例如 ${(failed[0] as PromiseRejectedResult).reason.cause?.code}）` : ''
  console.log(`${label}：上游同時最多 ${max} 個請求，失敗 ${failed.length} 個${why}，花 ${Date.now() - t0}ms`)
}

await measure('Promise.all 一次全發', () => Promise.allSettled(ids.map(get)))
await measure('同時最多 5 個', async () => {
  const results: PromiseSettledResult<unknown>[] = []
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const i = next++
      try { results[i] = { status: 'fulfilled', value: await get(ids[i]) } } catch (reason) { results[i] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  return results
})

server.closeAllConnections()
server.close()
