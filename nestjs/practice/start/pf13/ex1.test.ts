// 練習 1：202 → worker 產生 CSV，內容只有自己租戶的 project，特殊字元有跳脫
import { call, pollUntil, signupTenant, target, type Account } from '../../helpers/portfolio.ts'
import { parseCsv } from './csv.ts'

const t = await target(import.meta.dirname, 'saas')
const project = async (acc: Account, name: string, description?: string) => {
  const r = await call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name, description } })
  expect(r.status, `POST /api/v1/projects 要 201：${r.text.slice(0, 200)}`).toBe(201)
  return r.body.id as string
}

describe('練習 1：匯出', () => {
  it('POST /exports 202 queued，輪詢到 done，CSV 只有自己的 project、逗號引號換行都正確', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await project(b, 'B 的秘密專案')
    const ids = [await project(a, '逗號, 和 "引號"', '第一行\n第二行'), await project(a, '普通的名字')]
    const r = await call(t, 'POST', '/api/v1/exports', { token: a.token, body: { type: 'projects' } })
    expect(r.status, `POST /api/v1/exports 要 202（工作交給背景，不在請求裡做完）：${r.text.slice(0, 200)}`).toBe(202)
    expect(r.body, '回應要是 { id, status: "queued" }').toMatchObject({ status: 'queued' })
    const done = await pollUntil(async () => {
      const s = await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: a.token })
      expect(s.status, `GET /api/v1/exports/:id 要 200：${s.text.slice(0, 200)}`).toBe(200)
      expect(s.body.status, '匯出失敗了：看 API 的 log').not.toBe('failed')
      return s.body.status === 'done' && s.body
    }, { what: '匯出變成 done（worker 有在跑嗎？job 裡有沒有帶 tenantId？）' })
    expect(done.rowCount, 'rowCount 要是自己租戶的 project 數（比較多：worker 讀到了別的租戶，要用 job 的 tenantId 重建租戶上下文）').toBe(2)
    expect(done.finishedAt, '完成後要有 finishedAt').toBeTruthy()

    const content = await call(t, 'GET', `/api/v1/exports/${r.body.id}/content`, { token: a.token })
    expect(content.status).toBe(200)
    expect(content.text, '匯出了別的租戶的資料：worker 要用 job 的 tenantId 重建租戶上下文，不能用看得到全部租戶的連線').not.toContain('B 的秘密專案')
    const rows = parseCsv(content.text)
    expect(rows[0], '標題列要是 id,name,description,archived,createdAt').toEqual(['id', 'name', 'description', 'archived', 'createdAt'])
    expect(rows.length, `要 1 列標題＋2 列資料，實際解析出 ${rows.length} 列：有逗號、雙引號、換行的值要用雙引號包起來，裡面的雙引號寫兩次`).toBe(3)
    expect(rows.slice(1).map(r => r[0]), '每列第一格是 project id，順序依建立時間').toEqual(ids)
    expect(rows[1].slice(1, 4), '名稱與描述要原樣還原（逗號、雙引號、換行）').toEqual(['逗號, 和 "引號"', '第一行\n第二行', 'false'])
    expect(rows[2][1]).toBe('普通的名字')
  })
})
