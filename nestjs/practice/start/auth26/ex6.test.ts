// 練習 6：從網址匯入圖片的 SSRF（第 22 課的規則）
import { createServer, type Server } from 'node:http'
import { isIP } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DnsResolver, HttpFetcher, type FetchOptions, type FetchResult } from './src/products/net.js'
import { bearer, login, makeApp, seed, U } from './test-fixtures.ts'

const PUBLIC = '93.184.216.34'
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')
// 假 DNS：測試決定每個名稱解析成什麼；IP 字面值原樣回傳
const dns: Record<string, string[]> = {
  'img.coffee.example': [PUBLIC],
  'cdn.coffee.example': [PUBLIC],
  'metadata.coffee.example': ['169.254.169.254'],
  'mixed.coffee.example': [PUBLIC, '10.0.0.5'],
  'mapped.coffee.example': ['::ffff:127.0.0.1'],
  'v6.coffee.example': ['fd00::1'],
  'internal.coffee.example': ['10.0.0.8'],
}
const resolver = { resolve: vi.fn(async (host: string) => isIP(host) ? [host] : dns[host] ?? []) }
// 假 HTTP：依網址回應；記下每次連線的網址與 IP
let routes: Record<string, Partial<FetchResult>> = {}
const fetcher = {
  get: vi.fn(async (url: URL, ip: string, opts: FetchOptions): Promise<FetchResult> => ({
    status: 200, location: null, contentType: 'image/png', body: PNG, ...routes[url.href],
  })),
}

let fake: Awaited<ReturnType<typeof makeApp>>
let token: string
beforeAll(async () => {
  fake = await makeApp(b => b.overrideProvider(DnsResolver).useValue(resolver).overrideProvider(HttpFetcher).useValue(fetcher))
  await seed(fake.prisma)
  token = (await login(fake.app, U.manager1)).access
})
beforeEach(() => { routes = {} })
afterAll(() => fake?.app.close())

const importUrl = (url: string, app = fake) => app.http().post('/products/1/image-from-url').set(bearer(token)).send({ url })

describe('練習 6：SSRF', () => {
  it('功能：公開的 https 圖片可以匯入，而且是連到驗證過的 IP', async () => {
    const res = await importUrl('https://img.coffee.example/latte.png')
    expect(res.status, '公開網址的圖片要能匯入（200）：用注入的 DnsResolver 與 HttpFetcher，不要直接用 fetch').toBe(200)
    expect(fetcher.get, '下載要透過 HttpFetcher.get').toHaveBeenCalledTimes(1)
    const [url, ip, opts] = fetcher.get.mock.calls[0]
    expect(url.href).toBe('https://img.coffee.example/latte.png')
    expect(ip, 'HttpFetcher.get 的第二個參數要是剛才驗證過的 IP，不能讓它自己再查一次 DNS（DNS rebinding）').toBe(PUBLIC)
    expect(opts, '大小上限 5 MB（5 * 1024 * 1024 bytes）、總時間 5 秒').toEqual({ maxBytes: 5 * 1024 * 1024, timeoutMs: 5000 })
    const product = await fake.prisma.product.findUniqueOrThrow({ where: { id: 1 } })
    expect(product.imageUrl).toBe('https://img.coffee.example/latte.png')
  })

  const attacks: [string, string][] = [
    ['http://img.coffee.example/a.png', '只接受 https'],
    ['https://img.coffee.example:8443/a.png', '只接受 443 port'],
    ['https://admin:secret@img.coffee.example/a.png', '網址不能有帳號密碼（userinfo）'],
    ['https://127.0.0.1/a.png', '迴圈位址'],
    ['https://2130706433/a.png', '十進位寫法的 127.0.0.1'],
    ['https://[::1]/a.png', 'IPv6 的迴圈位址'],
    ['https://metadata.coffee.example/latest', '解析成 169.254.169.254（雲端 metadata）'],
    ['https://mixed.coffee.example/a.png', '解析出好幾個位址，其中一個是私有位址就拒絕'],
    ['https://mapped.coffee.example/a.png', '解析成 ::ffff:127.0.0.1（IPv4 對應的 IPv6 位址）'],
    ['https://v6.coffee.example/a.png', '解析成 fd00::1（IPv6 私有位址）'],
    ['https://nowhere.coffee.example/a.png', '解析不到任何位址'],
  ]
  for (const [url, why] of attacks) {
    it(`攻擊：${url} → 400（${why}），而且沒有連線`, async () => {
      const res = await importUrl(url)
      expect(res.status, `${url}：${why}，要回 400`).toBe(400)
      expect(fetcher.get, `${url}：驗證沒過就不能發出任何連線`).not.toHaveBeenCalled()
    })
  }

  it('攻擊：重導向到內網 → 400；每一跳都要重新驗證', async () => {
    routes['https://img.coffee.example/a.png'] = { status: 302, location: 'https://internal.coffee.example/admin', body: Buffer.alloc(0) }
    const res = await importUrl('https://img.coffee.example/a.png')
    expect(res.status, '第一跳是公開位址、重導向到 10.0.0.8：每一跳都要重新解析、重新驗證').toBe(400)
    expect(fetcher.get, '只能連第一跳，不能連到內網').toHaveBeenCalledTimes(1)
    expect(JSON.stringify(res.body), '錯誤訊息不能透露內部的網址、IP 或連線細節').not.toMatch(/internal|10\.0\.0\.8|302/)
  })

  it('功能：正常的重導向最多跟 3 次', async () => {
    routes['https://img.coffee.example/a.png'] = { status: 301, location: 'https://cdn.coffee.example/a.png', body: Buffer.alloc(0) }
    routes['https://cdn.coffee.example/a.png'] = { status: 302, location: '/b.png', body: Buffer.alloc(0) }
    expect((await importUrl('https://img.coffee.example/a.png')).status, '兩次重導向（含相對路徑 /b.png）之後是圖片，要成功').toBe(200)
    expect(fetcher.get.mock.calls.map(c => [c[0].href, c[1]])).toEqual([
      ['https://img.coffee.example/a.png', PUBLIC], ['https://cdn.coffee.example/a.png', PUBLIC], ['https://cdn.coffee.example/b.png', PUBLIC],
    ])
  })

  it('攻擊：無限重導向 → 400', async () => {
    for (let i = 0; i < 6; i++) routes[`https://img.coffee.example/${i}`] = { status: 302, location: `/${i + 1}`, body: Buffer.alloc(0) }
    expect((await importUrl('https://img.coffee.example/0')).status, '超過 3 次重導向要 400').toBe(400)
    expect(fetcher.get, '最多連 4 次（原本的網址＋3 次重導向）').toHaveBeenCalledTimes(4)
  })

  it('攻擊：不是圖片 → 400', async () => {
    routes['https://img.coffee.example/a.png'] = { contentType: 'text/html' }
    expect((await importUrl('https://img.coffee.example/a.png')).status).toBe(400)
  })
})

describe('練習 6：真的網路（沒有替換 provider）', () => {
  let internal: Server, hits = 0, port = 0
  let real: Awaited<ReturnType<typeof makeApp>>
  beforeAll(async () => {
    internal = createServer((_, res) => { hits++; res.setHeader('Content-Type', 'image/png'); res.end(PNG) })
    await new Promise<void>(r => internal.listen(0, '127.0.0.1', () => r()))
    port = (internal.address() as { port: number }).port
    real = await makeApp()
  })
  afterAll(async () => {
    await real?.app.close()
    await new Promise(r => internal?.close(r))
  })

  for (const url of ['http://127.0.0.1:<port>/a.png', 'https://127.0.0.1:<port>/a.png', 'https://localhost:<port>/a.png', 'https://localhost/a.png']) {
    it(`攻擊：本機的「內網服務」${url} → 400，內網服務沒有收到請求`, async () => {
      hits = 0
      const res = await importUrl(url.replace('<port>', String(port)), real)
      expect(res.status, '連到本機的網址要 400').toBe(400)
      expect(hits, '內網服務一個請求都不能收到').toBe(0)
      expect(JSON.stringify(res.body), '錯誤訊息不能透露連線細節').not.toMatch(/ECONN|127\.0\.0\.1|localhost|refused/i)
    })
  }
})
