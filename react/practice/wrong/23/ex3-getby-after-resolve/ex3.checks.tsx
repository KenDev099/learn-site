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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PRODUCTS, type FakeMenuApi } from '../../helpers/fake-api.ts'
import type { MenuPageProps } from './MenuPage.tsx'

function setup(Page: ComponentType<MenuPageProps>, makeApi: () => FakeMenuApi) {
  cleanup()
  const api = makeApi()   // 每個情境一個新的假 API：呼叫紀錄從 0 開始
  const user = userEvent.setup()
  render(<Page api={api} />)
  const call = (i: number) => {
    const c = api.callsOf('getMenu')[i]
    expect(c, `getMenu 應該被呼叫了第 ${i + 1} 次`).toBeDefined()
    return c
  }
  return { api, user, call }
}

async function expectFullMenu() {
  const menu = screen.getByRole('list', { name: '菜單' })   // 等 React 把成功的結果畫上去
  expect(within(menu).getAllByRole('listitem'), '菜單要列出全部商品').toHaveLength(PRODUCTS.length)
  for (const p of PRODUCTS) expect(within(menu).getByText(p.name, { exact: false })).toBeInTheDocument()
  expect(screen.queryByRole('status'), '成功之後載入訊息要消失').not.toBeInTheDocument()
  expect(screen.queryByRole('alert'), '成功之後不能有錯誤訊息').not.toBeInTheDocument()
}

export async function checkMenuPage(Page: ComponentType<MenuPageProps>, makeApi: () => FakeMenuApi) {
  // 情境 1：載入中 → 成功
  {
    const { api, call } = setup(Page, makeApi)
    expect(screen.getByRole('status'), '等待時要有 role="status" 的載入訊息').toBeInTheDocument()
    expect(api.callsOf('getMenu'), '掛載時呼叫 getMenu 一次').toHaveLength(1)
    call(0).resolve()
    await expectFullMenu()
  }

  // 情境 2：載入中 → 失敗 → 重試 → 成功
  {
    const { api, user, call } = setup(Page, makeApi)
    call(0).reject(new Error('網路斷線'))
    expect(await screen.findByRole('alert'), '失敗要顯示 role="alert" 的錯誤訊息').toBeInTheDocument()
    expect(screen.queryByRole('status'), '失敗之後載入訊息要消失').not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(screen.queryByRole('alert'), '按重試之後錯誤訊息要消失').not.toBeInTheDocument()
    expect(screen.getByRole('status'), '按重試之後要回到載入中').toBeInTheDocument()
    expect(api.callsOf('getMenu'), '按重試要再呼叫一次 getMenu').toHaveLength(2)

    call(1).resolve()
    await expectFullMenu()
  }
}
