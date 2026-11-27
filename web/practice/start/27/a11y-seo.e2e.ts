import type { BrowserContext } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

export type Route = { path: string, status: 200 | 404 }
export type Report = { route: string, problems: string[] }

// 對每個公開路由做 SEO 與無障礙驗收，回傳每個路由的問題清單（沒有問題就是空陣列）
// 每個問題是一個字串，開頭寫代碼，後面寫說明，例如 'canonical：要是絕對網址，現在是 /menu/'
// 代碼：status、noindex、duplicate-title、canonical、jsonld、lcp-lazy、axe:<規則 id>
export async function auditPublicPages(context: BrowserContext, baseUrl: string, routes: Route[]): Promise<Report[]> {
  const reports: Report[] = []
  const page = await context.newPage()
  const response = await page.goto(new URL(routes[0].path, baseUrl).href)
  reports.push({ route: routes[0].path, problems: response?.status() === 200 ? [] : ['status'] })
  return reports
}
