// 第 28 課的驗收套件：把 site/ 用 build.ts 建置、用 serve.ts 提供，再用本機 Chrome 檢查 14 個驗收項目
// 測試用的 store.json 會換一組營業時間（TEST_HOURS），確認頁面與 JSON-LD 真的是從資料產生的
// 這個檔案每次執行 check.mjs 都會換成最新版，不要改它
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

export const ORIGIN = 'https://brew.example.tw'
export const CRITERIA: [string, string][] = [
  ['R1', '三個頁面在 320、768、1280px 寬都不會橫向捲動'],
  ['R2', '根字級放大到 200% 時，320px 寬仍不會橫向捲動'],
  ['R3', '手機寬度的主選單用原生元素開關（不需要 JavaScript），打開後看得到連結'],
  ['A1', 'axe（WCAG 2.2 A／AA）在手機與桌機寬度都沒有違規'],
  ['A2', '第一個 Tab 停點是「跳到主要內容」，目標是 <main id="main">'],
  ['A3', '每個 Tab 停點都有看得見的焦點樣式'],
  ['A4', '深色模式背景是暗的，文字對比通過 axe 的 color-contrast'],
  ['P1', '首頁的 LCP 元素是主視覺圖片，沒有 lazy、有 fetchpriority="high"'],
  ['P2', '每張圖片都有 width、height；網頁字型（如果有）設定 font-display'],
  ['P3', '初始 HTML 沒有第三方 script，也沒有擋住解析的 script'],
  ['P4', '手機（375px、DPR 2）首頁的圖片合計 < 600 KB，主視覺 < 200 KB'],
  ['S1', '每頁 title 不重複、有 description、恰好一個指向自己的絕對網址 canonical'],
  ['S2', 'robots.txt 允許爬取並宣告 sitemap；sitemap.xml 只有三個公開頁面的絕對網址'],
  ['S3', '營業時間與 JSON-LD 跟 data/store.json 一致；不存在的網址回 404 且有 noindex'],
]
export const CODES = CRITERIA.map(([c]) => c)
const PAGES = ['/', '/menu/', '/store/']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ZH = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
// 測試用的營業時間：週一公休、平日 08:00–19:00、週末 10:00–16:00
const TEST_HOURS = [{ days: [1, 2, 3, 4], opens: '08:00', closes: '19:00' }, { days: [5, 6], opens: '10:00', closes: '16:00' }]
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

type Problems = Record<string, string[]>

// 跑一次完整驗收，回傳每個項目代碼的問題清單（空陣列＝通過）
export async function runAcceptance(dir = process.cwd()): Promise<Problems> {
  const problems: Problems = Object.fromEntries(CODES.map(c => [c, []]))
  const add = (code: string, msg: string) => { if (!problems[code].includes(msg)) problems[code].push(msg) }
  const tmp = mkdtempSync(join(tmpdir(), 'learn-web-28-'))
  const src = join(tmp, 'src'), out = join(tmp, 'dist')
  let server: { url: string, close: () => Promise<void> } | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    cpSync(join(dir, 'site'), src, { recursive: true })
    const storeFile = join(src, 'data', 'store.json')
    const store = JSON.parse(readFileSync(storeFile, 'utf8'))
    store.hours = TEST_HOURS
    writeFileSync(storeFile, JSON.stringify(store, null, 2))
    let mod: { build: (src: string, out: string) => void, sitemapXml: (routes: { path: string, file: string, noindex?: boolean }[], origin: string) => string }
    try {
      mod = await import(pathToFileURL(join(dir, 'build.ts')).href)
      await mod.build(src, out)
    } catch (e) {
      for (const c of CODES) add(c, `build.ts 執行失敗：${(e as Error).message}`)
      return problems
    }
    const { serve } = await import(pathToFileURL(join(dir, 'serve.ts')).href)
    server = await serve(out)
    const base = server!.url
    browser = await chromium.launch({ channel: 'chrome' })
    // 不連外網：只允許本機網站的請求
    const ctx = async (o: Parameters<typeof browser.newContext>[0]) => {
      const c = await browser!.newContext(o)
      await c.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort())
      return c
    }
    const desktop = await ctx({ viewport: { width: 1280, height: 800 } })
    const mobile = await ctx({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
    const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const axe = async (p: Page, rules?: string[]) => {
      const b = new AxeBuilder({ page: p })
      const r = await (rules ? b.withRules(rules) : b.withTags(TAGS)).analyze()
      return r.violations.map(v => `${v.id}（${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join('、')}）`)
    }
    const titles = new Map<string, string>()

    for (const path of PAGES) {
      const name = `${path} `
      const p = await desktop.newPage()
      const res = await p.goto(base + path)
      if (res?.status() !== 200) { add('S3', `${name}回應 ${res?.status()}，要是 200`); await p.close(); continue }

      // A2：鍵盤的第一個停點
      await p.keyboard.press('Tab')
      const first = await p.evaluate(() => {
        const a = document.activeElement as HTMLAnchorElement
        return { href: a?.getAttribute('href'), text: a?.textContent?.trim(), main: document.getElementById('main')?.localName ?? null }
      })
      if (first.href !== '#main') add('A2', `${name}第一個 Tab 停點是「${first.text || '（沒有）'}」，要是 href="#main" 的跳到主要內容連結`)
      if (first.main !== 'main') add('A2', `${name}找不到 <main id="main">`)

      // R1、R2：版面
      for (const w of [320, 768, 1280]) {
        await p.setViewportSize({ width: w, height: 800 })
        const o = await p.evaluate(w => {
          const over = () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          const normal = over()
          if (w !== 320) return [normal, 0]
          document.documentElement.style.fontSize = '200%'
          const big = over()
          document.documentElement.style.fontSize = ''
          return [normal, big]
        }, w)
        if (o[0] > 0) add('R1', `${name}在 ${w}px 寬會橫向捲動 ${o[0]}px`)
        if (o[1] > 0) add('R2', `${name}字級 200% 時在 320px 寬會橫向捲動 ${o[1]}px`)
      }

      // S1、P2、A3：一次讀完
      const h = await p.evaluate(() => {
        const tabbable = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')]
          .filter(e => e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled && e.checkVisibility({ visibilityProperty: true }))
        const noRing: string[] = []
        for (const e of tabbable) {
          e.focus({ focusVisible: true } as FocusOptions)
          if (document.activeElement !== e) continue
          const s = getComputedStyle(e)
          if (!((s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none')) noRing.push(`<${e.localName}>${(e.textContent ?? '').trim().slice(0, 12)}`)
        }
        ;(document.activeElement as HTMLElement)?.blur()
        return {
          title: document.title.trim(),
          description: document.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() ?? '',
          canonical: [...document.querySelectorAll('link[rel~="canonical" i]')].map(l => l.getAttribute('href') ?? ''),
          noSize: [...document.images].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src')),
          fonts: [...document.fonts].filter(f => f.display === 'auto' || f.display === 'block').map(f => f.family),
          noRing,
        }
      })
      if (!h.title) add('S1', `${name}沒有 title`)
      else if (titles.has(h.title)) add('S1', `${name}的 title「${h.title}」跟 ${titles.get(h.title)} 重複，每頁要寫自己的主題`)
      else titles.set(h.title, path)
      if (h.description.length < 20) add('S1', `${name}的 description 太短或沒寫（至少 20 字）`)
      if (h.canonical.length !== 1) add('S1', `${name}有 ${h.canonical.length} 個 canonical，要恰好一個`)
      else if (h.canonical[0] !== ORIGIN + path) add('S1', `${name}的 canonical 是「${h.canonical[0]}」，要是絕對網址 ${ORIGIN + path}`)
      for (const s of h.noSize) add('P2', `${name}的圖片 ${s} 少了 width 或 height，載入時版面會跳`)
      for (const f of h.fonts) add('P2', `${name}的字型 ${f} 沒有設定 font-display（用 swap 或 optional）`)
      for (const e of h.noRing) add('A3', `${name}${e} 聚焦時看不到焦點樣式（outline 被拿掉又沒有替代）`)

      // A1：桌機
      for (const v of await axe(p)) add('A1', `${name}1280px：${v}`)

      // A4：深色模式
      await p.emulateMedia({ colorScheme: 'dark' })
      const dark = await p.evaluate(() => {
        const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)!.map(Number)
        return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000
      })
      if (dark > 80) add('A4', `${name}深色模式的背景不夠暗（亮度 ${Math.round(dark)}／255），要用 prefers-color-scheme: dark 換一組顏色`)
      for (const v of await axe(p, ['color-contrast'])) add('A4', `${name}深色模式：${v}`)
      await p.close()

      // 手機：A1、R3
      const m = await mobile.newPage()
      await m.goto(base + path)
      for (const v of await axe(m)) add('A1', `${name}375px：${v}`)
      const toggle = m.locator('header').locator('button[popovertarget], summary').first()
      if (!(await toggle.count()) || !(await toggle.isVisible())) add('R3', `${name}手機寬度的頁首要有 <button popovertarget> 或 <summary> 打開選單`)
      else {
        const link = m.locator('header a[href="/menu/"]').first()
        if (await link.isVisible()) add('R3', `${name}選單還沒打開就看得到連結：手機寬度要先收起來`)
        await toggle.click()
        if (!(await link.isVisible())) add('R3', `${name}按了選單按鈕之後看不到「菜單」連結`)
      }
      await m.close()
    }

    // P1、P4：首頁在手機
    {
      const m = await mobile.newPage()
      const bytes = new Map<string, number>()
      m.on('response', async r => {
        if (r.request().resourceType() !== 'image') return
        try { bytes.set(r.url(), (await r.body()).length) } catch {}
      })
      await m.goto(base + '/', { waitUntil: 'load' })
      // 等首屏圖片解碼、再過兩幀，LCP 才會是最後畫出來的那個（機器忙時圖片可能比文字晚畫）
      await m.evaluate(() => Promise.race([
        Promise.all([...document.images].map(i => i.decode().catch(() => {})))
          .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))),
        new Promise(r => setTimeout(r, 3000)),
      ]))
      const lcp = await m.evaluate(() => new Promise<null | { tag: string, loading: string | null, priority: string | null, url: string }>(ok => {
        new PerformanceObserver(list => {
          const e = list.getEntries().at(-1) as PerformanceEntry & { element: Element | null, url: string }
          ok(e?.element ? { tag: e.element.localName, loading: e.element.getAttribute('loading'), priority: e.element.getAttribute('fetchpriority'), url: e.url } : null)
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        setTimeout(() => ok(null), 3000)
      }))
      if (!lcp || lcp.tag !== 'img') add('P1', `首頁的 LCP 元素是 ${lcp ? `<${lcp.tag}>` : '（量不到）'}，應該是主視覺圖片`)
      else {
        if (lcp.loading === 'lazy') add('P1', '首頁的主視覺圖片有 loading="lazy"：LCP 圖片要立刻載入')
        if (lcp.priority !== 'high') add('P1', '首頁的主視覺圖片要加 fetchpriority="high"')
      }
      await m.waitForLoadState('networkidle')
      const total = [...bytes.values()].reduce((a, b) => a + b, 0)
      if (total >= 600 * 1024) add('P4', `首頁在手機下載了 ${Math.round(total / 1024)} KB 的圖片，預算是 600 KB`)
      const hero = lcp?.url ? bytes.get(lcp.url) ?? 0 : 0
      if (hero >= 200 * 1024) add('P4', `首頁主視覺在手機下載了 ${Math.round(hero / 1024)} KB（${lcp!.url.split('/').pop()}）：用 srcset 提供 WebP 的小尺寸版本`)
      await m.close()
    }

    // P3：原始 HTML（伺服器回應的原文，不是執行後的 DOM）裡的 script
    {
      const htmls = await Promise.all(PAGES.map(async path => [path, await (await fetch(base + path)).text()]))
      const p = await desktop.newPage()
      const found = await p.evaluate(htmls => htmls.map(([path, html]) => {
        const d = new DOMParser().parseFromString(html, 'text/html')
        return [...d.querySelectorAll('script[src]')].map(s => ({ path, src: s.getAttribute('src')!, head: !!s.closest('head'), lazy: s.hasAttribute('defer') || s.hasAttribute('async') || s.getAttribute('type') === 'module' }))
      }).flat(), htmls)
      await p.close()
      for (const s of found) {
        if (/^(https?:)?\/\//.test(s.src) && new URL(s.src, ORIGIN).origin !== ORIGIN) add('P3', `${s.path} 的初始 HTML 載入第三方 script ${s.src}：移除，或改成使用者需要時才載入`)
        else if (s.head && !s.lazy) add('P3', `${s.path} 的 ${s.src} 在 head 裡擋住解析：加 defer`)
      }
    }

    // S2：robots.txt 與 sitemap.xml
    {
      const r = await fetch(base + '/robots.txt')
      const txt = r.ok ? await r.text() : ''
      if (!r.ok) add('S2', `/robots.txt 回應 ${r.status}`)
      const lines = txt.split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
      const disallow = lines.filter(l => /^disallow\s*:/i.test(l)).map(l => l.split(':').slice(1).join(':').trim()).filter(Boolean)
      for (const target of ['/', '/menu/', '/store/', '/css/site.css', '/img/hero-960.webp'])
        for (const d of disallow) if (target.startsWith(d.replace(/\*.*$/, ''))) add('S2', `robots.txt 的「Disallow: ${d}」擋住了 ${target}（staging 的設定忘了拿掉？）`)
      const sm = lines.filter(l => /^sitemap\s*:/i.test(l)).map(l => l.split(':').slice(1).join(':').trim())
      if (!sm.includes(`${ORIGIN}/sitemap.xml`)) add('S2', `robots.txt 要寫「Sitemap: ${ORIGIN}/sitemap.xml」（絕對網址）`)

      const s = await fetch(base + '/sitemap.xml')
      const xml = s.ok ? await s.text() : ''
      if (!xml.trim()) add('S2', 'sitemap.xml 是空的：完成 build.ts 的 sitemapXml()')
      else {
        if (!/<urlset[^>]+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml)) add('S2', 'sitemap.xml 要用 <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
        const locs = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map(x => x[1])
        const want = PAGES.map(p => ORIGIN + p)
        if (JSON.stringify([...locs].sort()) !== JSON.stringify([...want].sort())) add('S2', `sitemap 的網址是 ${JSON.stringify(locs)}，要恰好是 ${JSON.stringify(want)}（noindex 的 404 頁不放，網址要絕對）`)
        if (/<(priority|changefreq)>/.test(xml)) add('S2', 'sitemap 不要輸出 priority、changefreq：Google 會忽略它們')
      }
      // 換一組路由表與 origin 直接呼叫 sitemapXml()：擋下寫死三個網址的寫法
      const other = [{ path: '/', file: 'index.html' }, { path: '/beans/', file: 'beans/index.html' }, { path: '/draft/', file: 'draft/index.html', noindex: true }]
      let xml2 = ''
      try { xml2 = String(mod.sitemapXml(other, 'https://shop.example.test')) } catch {}
      const locs2 = [...xml2.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map(x => x[1]).sort()
      if (JSON.stringify(locs2) !== JSON.stringify(['https://shop.example.test/', 'https://shop.example.test/beans/']))
        add('S2', `sitemapXml() 要依傳入的 routes 與 origin 產生：測試傳入另一組路由（/、/beans/、noindex 的 /draft/）與 origin https://shop.example.test，得到 ${JSON.stringify(locs2)}，不要把網址寫死`)
    }

    // S3：404、營業時間、JSON-LD、菜單價格
    {
      const p = await desktop.newPage()
      const res = await p.goto(base + '/no-such-page/')
      if (res?.status() !== 404) add('S3', `不存在的網址 /no-such-page/ 回應 ${res?.status()}，要回 404（不然會變成 soft 404）`)
      const robots = await p.evaluate(() => document.querySelector('meta[name="robots" i]')?.getAttribute('content') ?? '')
      if (!/noindex/i.test(robots)) add('S3', '404 頁要有 <meta name="robots" content="noindex">')

      const norm = (s: string) => s.replace(/\s/g, '').replace(/[-~～－—]/g, '–')
      const want = ZH.map((d, i) => { const h = TEST_HOURS.find(x => x.days.includes(i)); return [d, h ? `${h.opens}–${h.closes}` : '公休'] })
      // 首頁與門市頁都有營業時間，兩頁都要從 store.json 產生
      for (const [path, label] of [['/', '首頁'], ['/store/', '門市頁']]) {
        await p.goto(base + path)
        const rows = await p.evaluate(() => [...document.querySelectorAll('dl.hours dt')].map(dt => [dt.textContent!.trim(), dt.nextElementSibling?.textContent?.trim() ?? '']))
        if (JSON.stringify(rows.map(([d, t]) => [d, norm(t)])) !== JSON.stringify(want))
          add('S3', `${label} <dl class="hours"> 的內容是 ${JSON.stringify(rows)}，測試資料應該產生 ${JSON.stringify(want)}：營業時間要從 data/store.json 產生（保留 <!-- build:hours -->），不能寫死`)
      }
      const ld = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent!) } catch { return null } }))
      const nodes = ld.flatMap(x => x?.['@graph'] ?? [x])
      const shop = nodes.find(x => x?.['@type'] === 'CafeOrCoffeeShop')
      if (!shop) add('S3', '門市頁找不到 @type 是 CafeOrCoffeeShop 的 JSON-LD')
      else {
        const spec: { dayOfWeek: string | string[], opens: string, closes: string }[] = [shop.openingHoursSpecification ?? []].flat()
        const got = DAYS.map(d => {
          const s = spec.filter(x => [x.dayOfWeek].flat().map(v => String(v).replace('https://schema.org/', '')).includes(d) && !(x.opens === '00:00' && x.closes === '00:00'))
          return s.map(x => `${x.opens}–${x.closes}`).join(',') || '公休'
        })
        if (JSON.stringify(got) !== JSON.stringify(want.map(([, t]) => t))) add('S3', `JSON-LD 的 openingHoursSpecification 換算成每天是 ${JSON.stringify(got)}，跟頁面（${JSON.stringify(want.map(([, t]) => t))}）不一致`)
        const data = JSON.parse(readFileSync(join(src, 'data', 'store.json'), 'utf8'))
        if (shop.name !== data.name) add('S3', `JSON-LD 的 name 是「${shop.name}」，store.json 是「${data.name}」`)
        if (shop.telephone !== data.telephone) add('S3', `JSON-LD 的 telephone 是「${shop.telephone}」，store.json 是「${data.telephone}」`)
        if (shop.address?.streetAddress !== data.address.streetAddress) add('S3', 'JSON-LD 的 address.streetAddress 要跟 store.json 一樣')
      }
      await p.goto(base + '/menu/')
      const table = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('tr')].filter(r => r.querySelector('th[scope="row"]')).map(r => [r.querySelector('th')!.textContent!.trim(), r.querySelector('td')?.textContent ?? ''])))
      for (const item of JSON.parse(readFileSync(join(src, 'data', 'store.json'), 'utf8')).menu)
        if (!(table[item.name] ?? '').replace(/[\s,]/g, '').includes(String(item.price))) add('S3', `菜單頁價目表裡「${item.name}」的價格不是 store.json 的 ${item.price}`)
      await p.close()
    }
  } finally {
    await browser?.close()
    await server?.close()
    rmSync(tmp, { recursive: true, force: true })
  }
  return problems
}

// 結果存在 .acceptance.json，用輸入檔案的 hash 判斷還能不能用：ex2 不用再跑一次瀏覽器
const fingerprint = (dir: string) => {
  const h = createHash('sha256')
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p).sort()) walk(join(p, f))
    else h.update(p.slice(dir.length)).update(readFileSync(p))
  }
  for (const f of ['site', 'build.ts', 'serve.ts', 'ex1.test.ts']) if (existsSync(join(dir, f))) walk(join(dir, f))
  return h.digest('hex')
}
export async function cachedAcceptance(dir = process.cwd()): Promise<Problems> {
  const file = join(dir, '.acceptance.json'), hash = fingerprint(dir)
  try { const c = JSON.parse(readFileSync(file, 'utf8')); if (c.hash === hash) return c.problems } catch {}
  const problems = await runAcceptance(dir)
  writeFileSync(file, JSON.stringify({ hash, problems }))
  return problems
}

if (import.meta.main) {
  let result: Problems
  before(async () => {
    result = await runAcceptance()
    writeFileSync('.acceptance.json', JSON.stringify({ hash: fingerprint(process.cwd()), problems: result }))
  }, { timeout: 180_000 })
  for (const [code, title] of CRITERIA)
    test(`${code} ${title}`, () => assert.ok(result[code].length === 0, result[code].join('\n')))
}
