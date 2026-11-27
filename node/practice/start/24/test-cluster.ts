// 練習 2、3 的測試用：在測試程序裡當 primary，用 cluster 開 n 個 server.ts。學習者不用讀
import cluster, { type Worker } from 'node:cluster'
import { once } from 'node:events'
import { request } from 'node:http'
import { join } from 'node:path'
import { after } from 'node:test'

const all = new Set<Worker>()
after(() => { for (const w of all) w.process.kill('SIGKILL') })

export async function startWorkers(n: number, databaseUrl: string) {
  cluster.setupPrimary({ exec: join(import.meta.dirname, 'server.ts'), execArgv: [], silent: true })
  const workers = Array.from({ length: n }, () => cluster.fork({ PORT: '0', DATABASE_URL: databaseUrl, NODE_TEST_CONTEXT: undefined }))
  // 先替每個 worker 掛好事件再等：不然等第一個的時候，第二個的 listening 已經錯過了
  const ready = workers.map(w => {
    all.add(w)
    let stderr = ''
    w.process.stderr?.setEncoding('utf8').on('data', (s: string) => { stderr += s })
    w.process.stdout?.resume()
    const timer = setTimeout(() => w.process.kill('SIGKILL'), 10_000)
    return Promise.race([
      once(w, 'listening').then(([address]) => ({ port: (address as { port: number }).port })),
      once(w, 'exit').then(() => ({ error: stderr })),
    ]).finally(() => clearTimeout(timer))
  })
  let port = 0
  for (const r of await Promise.all(ready)) {
    if ('error' in r) throw new Error(`server.ts 啟動失敗（看 import 的檔案有沒有錯）：${r.error.slice(0, 800)}`)
    port = r.port
  }
  const stop = async () => {
    await Promise.all(workers.filter(w => !w.isDead()).map(w => {
      const exited = once(w, 'exit')
      w.process.kill('SIGTERM')
      return exited
    }))
    for (const w of workers) all.delete(w)
  }
  return { url: `http://127.0.0.1:${port}`, workers, stop }
}

export type Reply = { status: number, pid: number, body: unknown }

// 每次都開一條新連線（agent: false）：cluster 分配的是連線，這樣請求才會分散到各個 worker
export function call(url: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<Reply>((resolve, reject) => {
    const req = request(url + path, { method, agent: false, headers: { 'content-type': 'application/json', ...headers } }, res => {
      let text = ''
      res.setEncoding('utf8').on('data', s => { text += s }).on('end', () => {
        let parsed: unknown = text
        try { parsed = JSON.parse(text) } catch {}
        resolve({ status: res.statusCode ?? 0, pid: Number(res.headers['x-pid']), body: parsed })
      })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('10 秒沒有回應')))
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
