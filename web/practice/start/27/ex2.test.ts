import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from '@playwright/test'
import { startSite, type Options } from './server.ts'
import { auditPublicPages, type Route } from './a11y-seo.e2e.ts'

const ROUTES: Route[] = [
  { path: '/', status: 200 },
  { path: '/menu/', status: 200 },
  { path: '/stores/', status: 200 },
  { path: '/order/', status: 200 },
  { path: '/no-such-page/', status: 404 },
]

// 依序套用多個替換，做出壞掉的網站；找不到要換的字串就丟錯（避免變體其實沒壞）
type Swap = [path: string, from: string, to: string]
const patchWith = (swaps: Swap[]): Options['patch'] => (path, body) => {
  for (const [p, from, to] of swaps) if (p === path) {
    assert(body.includes(from), `出題錯誤：${p} 裡找不到要替換的內容`)
    body = body.replace(from, to)
  }
  return body
}

let browser: Browser
before(async () => { browser = await chromium.launch({ channel: 'chrome' }) })
after(async () => { await browser?.close() })

// 跑學習者的函式，同時記錄同一時間最多開了幾個 page、最後有沒有全部關掉
async function audit(options: Options = {}) {
  const site = await startSite(options)
  const context = await browser.newContext()
  context.setDefaultTimeout(8000)
  context.setDefaultNavigationTimeout(30000)
  let open = 0, maxOpen = 0, created = 0
  context.on('page', page => {
    created++
    maxOpen = Math.max(maxOpen, ++open)
    page.on('close', () => open--)
  })
  try {
    const reports = await auditPublicPages(context, site.url, ROUTES.map(r => ({ ...r })))
    return { reports, maxOpen, created, open }
  } finally {
    await context.close()
    await site.close()
  }
}

function problemsOf(reports: { route: string, problems: string[] }[], path: string) {
  assert(Array.isArray(reports), 'auditPublicPages 要回傳陣列')
  const r = reports.find(x => x.route === path)
  assert(r, `回傳結果裡沒有 ${path}：每個路由都要檢查，回傳 { route: '${path}', problems: [...] }`)
  return r.problems
}

// 每個路由應該被抓到的問題代碼；沒列到的路由要是空陣列（不能誤報）
function expectProblems(reports: { route: string, problems: string[] }[], want: Record<string, string[]>, site: string) {
  for (const { path } of ROUTES) {
    const got = problemsOf(reports, path)
    for (const code of want[path] ?? []) {
      assert(got.some(p => p.startsWith(code)), `${site}：${path} 應該回報「${code}」開頭的問題，實際回報：${JSON.stringify(got)}`)
    }
    const extra = got.filter(p => !(want[path] ?? []).some(code => p.startsWith(code)))
    assert.deepEqual(extra, [], `${site}：${path} 多報了不存在的問題`)
  }
}

test('正確的網站：每個路由都沒有問題，一次最多開 3 個 page，用完都關掉', async () => {
  const r = await audit()
  expectProblems(r.reports, {}, '正確的網站')
  assert.equal(r.reports.length, ROUTES.length, `要回傳 ${ROUTES.length} 個路由的結果，每個路由一筆`)
  assert(r.created >= ROUTES.length, '要用題目傳入的 context 開 page（context.newPage()），每個路由都要真的打開')
  assert(r.maxOpen <= 3, `同一時間開了 ${r.maxOpen} 個 page：路由多的時候會拖垮瀏覽器，一次最多 3 個`)
  assert.equal(r.open, 0, '檢查完要 page.close()，不然每個路由都留下一個分頁')
})

test('壞掉的網站 A：JSON-LD 語法錯誤、首圖 lazy、title 重複、按鈕沒有名稱、404 回 200', async () => {
  const r = await audit({
    soft404: true,
    patch: patchWith([
      ['/', '"addressCountry": "TW" }\n}', '"addressCountry": "TW" },\n}'],
      ['/', ' fetchpriority="high">', ' loading="lazy">'],
      ['/stores/', '<title>門市資訊與營業時間｜豆留咖啡</title>', '<title>菜單：咖啡、茶與甜點價格｜豆留咖啡</title>'],
      ['/order/', '>加入購物車</button>', '><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2 12h11l2-8H7"/></svg></button>'],
    ]),
  })
  expectProblems(r.reports, {
    '/': ['jsonld', 'lcp-lazy'],
    '/menu/': ['duplicate-title'],
    '/stores/': ['duplicate-title'],
    '/order/': ['axe:button-name'],
    '/no-such-page/': ['status'],
  }, '網站 A')
})

test('壞掉的網站 B：canonical 指到別頁、canonical 是相對路徑、canonical 有兩個、文字對比不足、404 頁沒有 noindex', async () => {
  const r = await audit({
    patch: patchWith([
      ['/', '<link rel="canonical" href="https://brew.example.tw/">', '<link rel="canonical" href="https://brew.example.tw/menu/">'],
      ['/menu/', '<link rel="canonical" href="https://brew.example.tw/menu/">', '<link rel="canonical" href="/menu/">'],
      ['/stores/', '<link rel="canonical" href="https://brew.example.tw/stores/">', '<link rel="canonical" href="https://brew.example.tw/stores/">\n<link rel="canonical" href="https://brew.example.tw/">'],
      ['/stores/', '<p>大安店：', '<p style="color: #c8bfb4">大安店：'],
      ['/no-such-page/', '<meta name="robots" content="noindex">\n', ''],
    ]),
  })
  expectProblems(r.reports, {
    '/': ['canonical'],
    '/menu/': ['canonical'],
    '/stores/': ['canonical', 'axe:color-contrast'],
    '/no-such-page/': ['noindex'],
  }, '網站 B')
})
