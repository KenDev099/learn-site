/*
  練習 3：替菜單頁寫檢查（非同步）
  問題：起始版只確認「一開始有載入訊息」，成功、失敗、重試全都沒檢查。
  要求：完成 checkMenuPage(Page, makeApi)：元件不符合 MenuPage.tsx 開頭的規格時丟出錯誤，符合時正常結束。
  - 每個情境用 makeApi() 拿一個新的假 API（helpers/fake-api.ts 的手動模式）：
    api.callsOf('getMenu') 是每一次呼叫的紀錄，[i].resolve() 讓第 i 次成功（回傳全部 6 個商品）、[i].reject(錯誤) 讓它失敗
  - 情境 1：載入中 → 成功：一開始有 role="status"；成功後「菜單」清單有全部商品、role="status" 消失
  - 情境 2：載入中 → 失敗 → 按重試 → 成功：失敗時有 role="alert" 和「重試」、沒有 status；
    按重試後 alert 消失、回到 status、getMenu 被呼叫第 2 次；第 2 次成功後列出菜單、沒有 alert
  - 讓假 API 完成之後，用 findBy… 等畫面出現；檢查「不在畫面上」用 queryBy…（getBy… 找不到會直接丟錯）
  - 不能用 setTimeout 等待；每個情境開頭 cleanup()
  判分：你的函式會被套在 2 個正確版本和 6 個錯誤版本上。
*/
import { expect } from 'vitest'
import type { ComponentType } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'
import type { MenuPageProps } from './MenuPage.tsx'

export async function checkMenuPage(Page: ComponentType<MenuPageProps>, makeApi: () => FakeMenuApi) {
  cleanup()
  const api = makeApi()
  render(<Page api={api} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
  // 在這裡寫：讓 API 成功或失敗，等畫面更新，檢查每一步該出現和不該出現的東西
}
