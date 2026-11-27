import { expect, type Page } from '@playwright/test'

// 驗收咖啡店的點餐流程。流程有任何一步不對就要丟錯（web-first assertion 失敗時會自己丟錯）
// 只能用 getByRole、getByLabel、getByText 找元素（可以串接、可以 .filter()），
// 用 expect(locator).toBeVisible()／toHaveText() 這類會自動等待的斷言
export async function checkOrderFlow(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl)
  await page.getByRole('navigation', { name: '主選單' }).getByRole('link', { name: '線上點餐' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('線上點餐')

  // 頁面上有三個「加入購物車」：先縮小到「拿鐵」那一區，locator 才不會對到三個
  const latte = page.getByRole('region', { name: '拿鐵' })
  await latte.getByRole('radio', { name: '大杯' }).check()
  await latte.getByRole('button', { name: '加入購物車' }).click()
  await page.waitForTimeout(3000)
  await expect(page.getByRole('status')).toHaveText('購物車：1 件')

  await page.getByRole('link', { name: '前往結帳' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '拿鐵（大杯）× 1' })).toBeVisible()
  await page.getByLabel('姓名').fill('王小明')
  await page.getByLabel('電話').fill('0912345678')
  await page.getByRole('button', { name: '送出訂單' }).click()
  await expect(page.getByRole('status')).toHaveText(/訂單編號 A\d{4}/)
}
