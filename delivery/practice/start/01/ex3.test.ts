// 練習 3：確認實際行為，記進 observed.json 與 docs/KNOWN_ISSUES.md
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { sections } from '../../helpers/docs.ts'
import { matchRoute, routes } from '../../helpers/refs.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const observed = JSON.parse(readFileSync(join(dir, 'observed.json'), 'utf8'))
const issues = sections(readFileSync(join(dir, 'docs/KNOWN_ISSUES.md'), 'utf8'), 3)

const PROBES = {
  offlineProduct: { customerId: 1, items: [{ productId: 7, quantity: 1 }] },   // 7：桂花烏龍，已下架
  zeroQuantity: { customerId: 1, items: [{ productId: 1, quantity: 0 }] },
  unknownProduct: { customerId: 1, items: [{ productId: 999, quantity: 1 }] },
}
const API_PORT = readFileSync(join(dir, 'api/src/main.ts'), 'utf8').match(/PORT\s*\?\?\s*(\d+)/)?.[1]
const START = { offlineProduct: 500, zeroQuantity: 201, unknownProduct: 404 }   // 接手時系統的行為

// 從「重現指令」那一行拆出 curl 的方法、路徑、body
function parseCurl(line: string) {
  const cmd = line.replace(/`/g, '').replace(/\\\n/g, ' ')
  const url = cmd.match(/https?:\/\/[^\s'"]+/)?.[0]
  const data = cmd.match(/(?:-d|--data(?:-raw)?|--json)\s+'([^']*)'/)?.[1]
  const json = /--json\s/.test(cmd) || /content-type:\s*application\/json/i.test(cmd)   // 沒有這個標頭，API 會把 body 當成表單，回 422
  const method = cmd.match(/-X\s+(\w+)/)?.[1] ?? (data ? 'POST' : 'GET')
  const u = url ? new URL(url) : null
  return { ok: /\bcurl\b/.test(cmd) && !!u, method, host: u?.host ?? '', path: u?.pathname ?? '', data, json }
}

describe('練習 3：系統現在的行為', () => {
  let app: INestApplication
  let actual: Record<string, number>
  beforeAll(async () => {
    app = await createTestApp(AppModule)
    actual = {}
    for (const [k, body] of Object.entries(PROBES)) actual[k] = (await request(app.getHttpServer()).post('/orders').send(body)).status
  })
  afterAll(() => app?.close())

  it('這一課只記錄、不修：訂單程式還是接手時的行為', () => {
    expect(actual, '訂單的程式被改過了：接手第一週先記錄問題、交給團隊排優先序，不要順手修（把 api/src/orders 改回原樣）').toEqual(START)
  })

  it('observed.json 的三個狀態碼是實際送出去得到的', () => {
    for (const k of Object.keys(PROBES) as (keyof typeof PROBES)[]) {
      expect(observed[k], `${k} 要填實際打 API 得到的狀態碼（README 的說法不一定對）`).toBe(actual[k])
    }
  })

  for (const title of ['下架商品', '數量 0']) {
    it(`KNOWN_ISSUES.md 的「${title}」三行都填好，重現指令真的能重現`, async () => {
      const body = issues.get(title)
      expect(body, `docs/KNOWN_ISSUES.md 找不到「### ${title}」這一節`).toBeDefined()
      const field = (name: string) => body!.match(new RegExp(`^- ${name}：(.*)$`, 'm'))?.[1].trim() ?? ''
      const repro = field('重現指令'), impact = field('影響'), priority = field('優先序')
      expect(impact && !/TODO/.test(impact), '「影響」要寫：誰會遇到、會發生什麼事').toBeTruthy()
      expect(priority, '「優先序」寫 P1、P2 或 P3').toMatch(/^P[1-3]\b/)
      const c = parseCurl(repro)
      expect(c.ok, '「重現指令」要是一行 curl，含完整網址，例如 curl -X POST http://localhost:3100/…').toBe(true)
      expect(c.host, `網址要指向本機開發中的 API：http://localhost:${API_PORT}（看 api/src/main.ts），別人照貼才連得到`).toBe(`localhost:${API_PORT}`)
      expect(matchRoute(routes(app), c.method, c.path), `API 沒有 ${c.method} ${c.path} 這個路由`).toBe(true)
      expect(c.data, '下單要帶 body：-d \'{"customerId":1,…}\'（JSON 用單引號包起來）').toBeTruthy()
      expect(c.json, "少了 -H 'Content-Type: application/json'：別人照貼會得到 422，重現不出問題").toBe(true)
      let json: unknown
      expect(() => { json = JSON.parse(c.data!) }, `-d 後面不是合法的 JSON：${c.data}`).not.toThrow()
      const items = (json as { items?: { productId?: unknown; quantity?: unknown }[] })?.items
      const hit = Array.isArray(items) && items.some(i => title === '下架商品' ? i?.productId === 7 : i?.quantity === 0)
      expect(hit, title === '下架商品' ? 'body 的 items 裡要有下架的商品（productId 7），才是在重現這個問題' : 'body 的 items 裡要有 quantity 為 0 的品項，才是在重現這個問題').toBe(true)
      const expected = title === '下架商品' ? START.offlineProduct : START.zeroQuantity
      const res = await request(app.getHttpServer())[c.method.toLowerCase() as 'post'](c.path).send(json as object)
      expect(res.status, `照這個指令送出得到 ${res.status}，重現不出「${title}」的問題（應該是 ${expected}）`).toBe(expected)
    })
  }
})
