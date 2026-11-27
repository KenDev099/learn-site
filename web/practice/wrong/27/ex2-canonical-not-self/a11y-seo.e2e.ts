import type { BrowserContext } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

export type Route = { path: string, status: 200 | 404 }
export type Report = { route: string, problems: string[] }

// 對每個公開路由做 SEO 與無障礙驗收，回傳每個路由的問題清單（沒有問題就是空陣列）
// 每個問題是一個字串，開頭寫代碼，後面寫說明，例如 'canonical：要是絕對網址，現在是 /menu/'
// 代碼：status、noindex、duplicate-title、canonical、jsonld、lcp-lazy、axe:<規則 id>
export async function auditPublicPages(context: BrowserContext, baseUrl: string, routes: Route[]): Promise<Report[]> {
  const reports: Report[] = []
  const titles = new Map<string, string[]>()   // title → 用到它的路由，全部跑完才知道有沒有重複

  // 一次只開一個 page，用完就關：路由多的時候不會同時開幾十個分頁
  for (const route of routes) {
    const problems: string[] = []
    const page = await context.newPage()
    try {
      const response = await page.goto(new URL(route.path, baseUrl).href)
      const status = response?.status()
      if (status !== route.status) problems.push(`status：預期 ${route.status}，實際 ${status}`)

      if (route.status === 404) {
        const robots = await page.locator('meta[name="robots"]').evaluateAll(els => els.map(el => el.getAttribute('content') ?? ''))
        const header = response?.headers()['x-robots-tag'] ?? ''
        if (![...robots, header].some(v => /noindex/i.test(v))) problems.push('noindex：404 頁要有 noindex')
      } else {
        const title = (await page.title()).trim()
        titles.set(title, [...(titles.get(title) ?? []), route.path])

        // 用 DOM 讀，不用正規表示式讀原始碼：多個 canonical、屬性順序不同都讀得到
        const canonicals = await page.locator('link[rel="canonical"]').evaluateAll(els => els.map(el => el.getAttribute('href') ?? ''))
        if (canonicals.length !== 1) problems.push(`canonical：要恰好一個，現在有 ${canonicals.length} 個`)
        else if (!/^https?:\/\//.test(canonicals[0])) problems.push(`canonical：要是絕對網址，現在是 ${canonicals[0]}`)

        for (const text of await page.locator('script[type="application/ld+json"]').allTextContents()) {
          try { JSON.parse(text) } catch (e) { problems.push(`jsonld：JSON-LD 不是合法的 JSON（${(e as Error).message}）`) }
        }

        // 首屏（第一個畫面內）的圖片不能 lazy：LCP 圖片會被延後下載
        const viewport = page.viewportSize()!
        for (const img of await page.locator('img').all()) {
          const box = await img.boundingBox()
          if (box && box.y < viewport.height && await img.getAttribute('loading') === 'lazy') {
            problems.push(`lcp-lazy：首屏圖片 ${await img.getAttribute('src')} 不要 loading="lazy"`)
          }
        }

        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
        for (const v of axe.violations) problems.push(`axe:${v.id}：${v.help}（${v.nodes.length} 處）`)
      }
    } finally {
      await page.close()
    }
    reports.push({ route: route.path, problems })
  }

  for (const [title, paths] of titles) if (paths.length > 1) {
    for (const r of reports) if (paths.includes(r.route)) r.problems.push(`duplicate-title：「${title}」跟 ${paths.filter(p => p !== r.route).join('、')} 重複`)
  }
  return reports
}
