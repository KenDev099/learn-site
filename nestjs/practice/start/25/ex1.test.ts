// 練習 1：三個啟動問題（沒 export、import type、ESM 循環 import），修到 nest build + node dist/main.js 能啟動
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { createTestApp } from '../../helpers/app.ts'
import { build, start } from '../../helpers/server.ts'

const dir = import.meta.dirname
const stampsFile = await import('./src/stamps/stamps.service.js').catch(() => undefined)
const { ProductsService } = await import('./src/products/products.service.js')

const srcFiles = () => {
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name))
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts')) files.push(join(d, e.name))
    }
  }
  walk(join(dir, 'src'))
  return files
}
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// src 底下非型別的相對 import（含動態 import()）組成的圖，回傳第一個找到的循環
function findCycle(): string[] | undefined {
  const src = join(dir, 'src')
  const files = srcFiles()
  const graph = new Map<string, string[]>()
  const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm
  const dynamic = /\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]/g
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'))
    graph.set(f, [...code.matchAll(re), ...code.matchAll(dynamic)].map(m => resolve(dirname(f), m[1].replace(/\.js$/, '.ts'))).filter(t => files.includes(t)))
  }
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (f: string): string[] | undefined => {
    state.set(f, 1)
    stack.push(f)
    for (const t of graph.get(f) ?? []) {
      if (state.get(t) === 1) return [...stack.slice(stack.indexOf(t)), t]
      if (!state.has(t)) { const c = visit(t); if (c) return c }
    }
    stack.pop()
    state.set(f, 2)
  }
  for (const f of files) if (!state.has(f)) { const c = visit(f); if (c) return c.map(x => relative(src, x)) }
}

describe('練習 1：修好三個啟動問題', () => {
  let app: INestApplication | undefined
  let bootError: unknown

  beforeAll(async () => {
    try {
      const { AppModule } = await import('./src/app.module.js')
      app = await createTestApp(AppModule)
    } catch (e) {
      bootError = e
    }
  })
  afterAll(() => app?.close())

  it('Vitest 裡 AppModule 能建立（讀 Nest can\'t resolve dependencies 的 index 和模組名稱）', () => {
    expect(bootError && String((bootError as Error).message).slice(0, 600), 'AppModule 建立失敗').toBeUndefined()
  })

  it('POST /orders 回傳訂單和集點數，GET /stamps/:customer 是同一個數字', async () => {
    expect(app, '先讓 AppModule 能建立').toBeDefined()
    const server = app!.getHttpServer()
    const a = await request(server).post('/orders').send({ customer: '林志豪', productId: 2 })
    expect(a.status, 'POST /orders 要回 201').toBe(201)
    expect(a.body, '訂單要有 customer、productId、price（拿鐵 110）和 stamps').toMatchObject({ customer: '林志豪', productId: 2, price: 110, stamps: 1 })
    const b = await request(server).post('/orders').send({ customer: '林志豪', productId: 1 })
    expect(b.body.stamps, '第二杯之後集點數要是 2').toBe(2)
    await request(server).post('/orders').send({ customer: '張雅婷', productId: 4 })
    const s = await request(server).get(`/stamps/${encodeURIComponent('林志豪')}`)
    expect(s.body, 'GET /stamps/林志豪 要回 { customer, stamps: 2 }（別人的訂單不算）').toEqual({ customer: '林志豪', stamps: 2 })
    const missing = await request(server).post('/orders').send({ customer: '林志豪', productId: 99 })
    expect(missing.status, '沒有這個商品要回 404').toBe(404)
  })

  it('ProductsService 只由 ProductsModule 提供，別的模組靠 exports 拿到它', () => {
    expect(app, '先讓 AppModule 能建立').toBeDefined()
    const owners = [...app!.get(ModulesContainer).values()].filter(m => m.providers.has(ProductsService)).map(m => m.metatype.name)
    expect(owners, '不要在 OrdersModule 的 providers 再寫一次 ProductsService（會多建一份實例）：在 ProductsModule 加上 exports: [ProductsService]').toEqual(['ProductsModule'])
  })

  it('src 裡沒有循環 import，也不再用 forwardRef（不能只用 forwardRef、WrapperType 或動態 import 蓋過去）', () => {
    const cycle = findCycle()
    expect(cycle?.join(' → '), '還有循環 import：讓依賴只往一個方向，例如集點由 StampsService 自己記、OrdersService 下單後通知它').toBeUndefined()
    const left = srcFiles().filter(f => /\bforwardRef\s*\(/.test(stripComments(readFileSync(f, 'utf8')))).map(f => relative(join(dir, 'src'), f))
    expect(left, '循環拆掉之後 forwardRef 就不需要了，模組和 service 兩邊都拿掉').toEqual([])
  })

  it('StampsService 還在 src/stamps/stamps.service.ts', () => {
    expect(stampsFile?.StampsService, '找不到 src/stamps/stamps.service.ts 匯出的 StampsService：不要把兩個 service 搬進同一個檔案').toBeTypeOf('function')
  })

  it('nest build 之後 node dist/main.js 能啟動，GET /health 回 { status: "ok" }', async () => {
    build(dir)
    const server = await start(dir)
    try {
      const res = await fetch(`${server.url}/health`)
      expect(res.status, 'GET /health 要回 200').toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    } finally {
      await server.stop()
    }
  }, 90_000)
})
