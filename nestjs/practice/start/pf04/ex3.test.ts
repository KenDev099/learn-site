// 練習 3：用 docker compose 啟動整套（db → migrate → api），API 健康
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

describe('練習 3：用 compose 啟動的 API', () => {
  it('composeApi 的 /health/ready 回 200，資料庫是 up', async () => {
    // 出題檢查不在這裡 docker build 參考實作（要另外準備 lockfile，而且很慢）；參考實作的映像由寫課的人手動 build 驗證過
    if (t.verify) return
    expect(t.composeApi, '在 work/portfolio.json 的 small 區段加 "composeApi": "http://localhost:3001"（compose 裡 api 對外的 port），先執行 docker compose --profile app up -d --build --wait').toBeTruthy()
    const api = t.composeApi!.replace(/\/+$/, '')
    expect(api, 'composeApi 跟 api 一樣：這一題要測用 compose 啟動的容器，不是 npm run start:dev 的那個').not.toBe(t.api)
    let res: Response
    try { res = await fetch(`${api}/health/ready`, { signal: AbortSignal.timeout(5000) }) } catch {
      throw new Error(`連不到 ${api}：在你的 repo 執行 docker compose --profile app up -d --build --wait，再用 docker compose ps 看 api 的狀態`)
    }
    const text = await res.text()
    expect(res.status, `${api}/health/ready 要 200，實際 ${res.status}：${text.slice(0, 200)}（docker compose logs api 看原因）`).toBe(200)
    expect(JSON.parse(text)?.details?.database?.status, 'ready 的 body 要有 details.database.status = "up"').toBe('up')
  })
})
