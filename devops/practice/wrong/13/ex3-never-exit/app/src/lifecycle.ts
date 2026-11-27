// 練習 3：一個副本的生命週期。server.ts 已經在對的地方呼叫這幾個函式
import type { Server, ServerResponse } from 'node:http'

const DRAIN_MS = Number(process.env.DRAIN_MS ?? 3_000)
let draining = false

// liveness 只看程序本身：排空中也是活的，不能讓編排器以為它壞了
export function live(): number {
  return 200
}

// readiness：排空中就不接新流量
export function ready(depsOk: boolean): number {
  return depsOk && !draining ? 200 : 503
}

// 排空中的回應叫對方用完這條連線就關掉，代理不會再把請求送進來
export function onRequest(res: ServerResponse): void {
  if (draining) res.setHeader('connection', 'close')
}

export function setup(server: Server, closeDeps: () => Promise<void>, log: { info(msg: string): void }): void {
  // 要比前面代理的閒置逾時（nginx upstream 的 keepalive_timeout 60 秒）長，由代理先關連線
  server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? 65_000)
  process.once('SIGTERM', () => {
    log.info('SIGTERM received, draining')
    draining = true
    setTimeout(() => {
      // 不再接新連線、關掉閒置的連線；手上的請求做完後才呼叫 callback
      server.close()
    }, DRAIN_MS)
  })
}
