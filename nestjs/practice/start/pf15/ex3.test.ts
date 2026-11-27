// 練習 3：文件會公開給前端（甚至外部），裡面不能有內部網址與看起來像真的 secret
import { call, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const res = await call(t, 'GET', '/openapi.json')

describe('練習 3：文件不洩漏內部資訊', () => {
  it('沒有內部網址（localhost、127.0.0.1、內網 IP、.internal、.local）', () => {
    expect(res.status, 'GET /openapi.json 要 200').toBe(200)
    const hit = res.text.match(/localhost|127\.0\.0\.1|\b10\.\d+\.\d+\.\d+|\b192\.168\.\d+|\b172\.(1[6-9]|2\d|3[01])\.\d+|[\w-]+\.(internal|local|lan)\b/)
    expect(hit?.[0], `文件裡出現內部網址「${hit?.[0]}」：servers、description、example 都會給所有看文件的人看到。servers 不寫（用相對路徑）或只寫公開網址`).toBeUndefined()
  })

  it('沒有看起來像真的 token 或金鑰的範例值（JWT、sk_live_、AKIA…、私鑰）', () => {
    const hit = res.text.match(/eyJ[\w-]{10,}\.[\w-]{10,}|sk_(live|test)_\w+|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/)
    expect(hit?.[0], `文件裡出現像真的 secret 的值「${hit?.[0]?.slice(0, 20)}…」：example 用明顯的假值，從開發環境複製來的 token 也要當成外洩，換掉`).toBeUndefined()
  })
})
