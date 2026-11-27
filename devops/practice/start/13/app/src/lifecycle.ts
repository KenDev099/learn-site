// 練習 3：一個副本的生命週期。server.ts 已經在對的地方呼叫這幾個函式
import type { Server, ServerResponse } from 'node:http'

// 收到 SIGTERM 之後，先繼續服務 DRAIN_MS 毫秒，讓前面的代理有時間把流量移走
const DRAIN_MS = Number(process.env.DRAIN_MS ?? 3_000)
let draining = false

// GET /health/live 的狀態碼：這個程序要不要被重啟
export function live(): number {
  return 200
}

// GET /health/ready 的狀態碼：這個副本現在能不能接新流量。depsOk 是資料庫和 Redis 都連得上
export function ready(depsOk: boolean): number {
  return depsOk ? 200 : 503
}

// 每個請求一進來就呼叫，可以在這裡先設定回應標頭
export function onRequest(res: ServerResponse): void {
}

// 啟動時呼叫一次（在 listen 之前）。closeDeps 會關掉資料庫連線池和 Redis
export function setup(server: Server, closeDeps: () => Promise<void>, log: { info(msg: string): void }): void {
  process.on('SIGTERM', () => {
    log.info('SIGTERM received')
    process.exit(0)
  })
}
