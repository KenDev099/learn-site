// 練習 3：幫同事的 CAFE-15 開 PR，填好 pr.md 的五段
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { codeBlocks, sections } from '../../helpers/docs.ts'
import { matchRoute, scripts } from '../../helpers/refs.ts'

const dir = import.meta.dirname
const pr = readFileSync(join(dir, 'pr.md'), 'utf8')
const parts = sections(pr)
// 範本的（提示：…）那一行不算內容
const body = (title: string) => (parts.get(title) ?? '').split('\n').filter(l => !/^（提示：.*）$/.test(l.trim())).join('\n').trim()
const TITLES = ['目的', '變更內容', '驗收條件對照', '如何驗證', '風險與回滾']
const API_PORT = readFileSync(join(dir, 'api/src/main.ts'), 'utf8').match(/PORT\s*\?\?\s*(\d+)/)?.[1]
// 套用 changes/CAFE-15.patch 之後 API 有的路由
const ROUTES = ['GET /health', 'GET /products', 'PATCH /products/:id/sold-out', 'POST /orders', 'GET /orders/:id']

// 拆出 curl 的方法、網址、body（規則同第 1 課練習 3）
function parseCurl(cmd: string) {
  const url = cmd.match(/https?:\/\/[^\s'"]+/)?.[0]
  const data = cmd.match(/(?:-d|--data(?:-raw)?|--json)\s+'([^']*)'/)?.[1]
  const json = /--json\s/.test(cmd) || /content-type:\s*application\/json/i.test(cmd)
  const method = cmd.match(/-X\s+(\w+)/)?.[1]?.toUpperCase() ?? (data ? 'POST' : 'GET')
  const u = url ? new URL(url) : null
  return { cmd, method, host: u?.host ?? '', path: u?.pathname ?? '', data, json }
}

describe('練習 3：pr.md', () => {
  it('五段都在，而且都填了', () => {
    for (const t of TITLES) {
      expect(parts.has(t), `找不到「## ${t}」：五個標題不要改名`).toBe(true)
      expect(body(t), `「## ${t}」還是空的`).not.toBe('')
      expect(body(t), `「## ${t}」還有 TODO 沒填`).not.toMatch(/TODO/)
    }
  })

  it('目的寫出需求單編號', () => {
    expect(body('目的'), '「目的」要寫出需求單編號 CAFE-15：日後有人追查「為什麼這樣改」，要能找回原始需求').toMatch(/CAFE-15/)
  })

  it('驗收條件對照列出 AC1–AC3', () => {
    for (const ac of ['AC1', 'AC2', 'AC3']) {
      expect(body('驗收條件對照'), `「驗收條件對照」少了 ${ac}：需求單的每一條都要寫出怎麼確認`).toMatch(new RegExp(`\\b${ac}\\b`))
    }
  })

  it('如何驗證有可以照貼的指令，而且 npm run 都存在', () => {
    const lines = codeBlocks(body('如何驗證')).join('\n').split('\n').map(l => l.trim()).filter(Boolean)
    expect(lines.length, '「如何驗證」要有 ``` 包起來的指令，審查者照貼就能驗證；「本機測過了」不算').toBeGreaterThan(0)
    const curls = codeBlocks(body('如何驗證')).join('\n').replace(/\\\n/g, ' ').split('\n')
      .map(l => l.replace(/#.*$/, '').trim()).filter(l => /^curl\b/.test(l)).map(parseCurl)
    for (const c of curls) {
      expect(c.host, `「${c.cmd}」要打本機的 API：http://localhost:${API_PORT}（看 api/src/main.ts）`).toBe(`localhost:${API_PORT}`)
      expect(matchRoute(ROUTES, c.method, c.path), `「${c.cmd}」：套用 patch 之後 API 也沒有 ${c.method} ${c.path}（看 patch 裡的 @Controller／@Get／@Patch）`).toBe(true)
    }
    const patch = curls.find(c => matchRoute(['PATCH /products/:id/sold-out'], c.method, c.path))
    expect(patch, '用 curl 實際打一次新的 API：curl -X PATCH http://localhost:…/products/2/sold-out …，審查者才能確認 AC1、AC3').toBeDefined()
    expect(patch!.json, "PATCH 那行少了 -H 'Content-Type: application/json'：照貼會得到 422（body 被當成表單）").toBe(true)
    let sent: { soldOut?: unknown } | undefined
    try { sent = JSON.parse(patch!.data ?? '') } catch { sent = undefined }
    expect(typeof sent?.soldOut, `PATCH 要帶 JSON body，例如 -d '{"soldOut":true}'（用單引號包起來）；目前是 ${patch!.data}`).toBe('boolean')
    const exists = scripts(dir)
    for (const [, name] of pr.matchAll(/npm run ([\w:-]+)/g)) {
      expect(exists[name], `package.json 沒有 "${name}" 這個 script：審查者照貼會看到 Missing script`).toBeDefined()
    }
  })

  it('風險與回滾寫出刪欄位的風險與做法', () => {
    const risk = body('風險與回滾')
    expect(risk, '這個 PR 的 migration 會刪掉哪個欄位？在「風險與回滾」寫出它的名字（看 changes/CAFE-15.patch）').toMatch(/legacy_sku/)
    expect(risk, '「不用備份」正好相反：欄位刪掉就回不來，上線前要先備份').not.toMatch(/(不用|不需要|不必|免|沒必要)\s*(先)?\s*備份/)
    const backup = /備份|pg_dump/.test(risk)
    const twoStep = /(停用|停止使用|不再使用|不再讀|拆成|拆出)[\s\S]*(下一版|下個版本|下一個版本|下一個 PR|另一個 PR|之後)[\s\S]*刪/.test(risk)
    expect(backup || twoStep, 'git revert 只會還原程式，被刪掉的欄位和資料回不來。寫出一種保護資料的做法：上線前先備份這一欄，或先停用、下一版再刪欄位').toBe(true)
  })
})
