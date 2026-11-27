import { expect, type Page } from '@playwright/test'

// 驗收咖啡店的點餐流程。流程有任何一步不對就要丟錯（web-first assertion 失敗時會自己丟錯）
// 只能用 getByRole、getByLabel、getByText 找元素（可以串接、可以 .filter()），
// 用 expect(locator).toBeVisible()／toHaveText() 這類會自動等待的斷言
export async function checkOrderFlow(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl)
  // 1. 首頁 → 點「線上點餐」
  // 2. 在「拿鐵」那一區選「大杯」，按「加入購物車」
  // 3. 購物車數量顯示 1
  // 4. 前往結帳，填姓名與電話，送出訂單
  // 5. 看到訂單編號（A 加 4 位數字，例如 A1024）
  throw new Error('還沒寫完')
}
