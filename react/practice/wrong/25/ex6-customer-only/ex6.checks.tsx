/*
練習 6：替店員區的守衛寫檢查（第 23 課「用錯誤版本檢查你的測試」）
問題：守衛只有一個測試「店員進自己門市看得到看板」，練習 4 列的錯誤寫法放進來全都會通過。
要求：完成 checkStaffGuard(makeRoute)：守衛不符合規格時丟出錯誤（用 expect），符合時正常結束。
  規格（跟練習 4 一樣）：
  - 沒登入：導到 /login，redirect 參數是原本的路徑加 query（例如 /staff/1?view=compact）；看板一次都不能出現
  - 顧客：網址不變，顯示 role="alert"（文字不固定），看板不能出現
  - 店員、店長只能進自己門市：別間門市一樣是 role="alert"、網址不變、看板不能出現；自己門市看得到看板
  - 看板是 <h1>店員看板</h1>
  open() 已經寫好：每個情境用它開一個新的畫面
判分：你的函式會被套在 2 個寫法不同的正確版本，和 6 個錯誤版本上。
*/
import { expect } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import type { Auth, User } from './shared/api.ts'

export type MakeRoute = (auth: Auth) => RouteObject

export const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 1 }
export const CUSTOMER: User = { id: 5, name: '李建國', role: 'customer', storeId: null }

/** 用 user 登入（null 是沒登入），打開 url。回傳目前網址、登入頁收到的 redirect、某段文字有沒有出現過 */
export async function open(makeRoute: MakeRoute, user: User | null, url: string) {
  cleanup()
  const seen: string[] = []
  // 記下每次新加進畫面的節點文字：就算它馬上又被移除，也留得下紀錄
  const observer = new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) seen.push(n.textContent ?? '')
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  const router = createMemoryRouter([{
    path: '/',
    HydrateFallback: () => null,
    children: [
      { path: 'login', Component: () => <h1>登入頁</h1> },
      makeRoute({ user }),
    ],
  }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) })
  observer.disconnect()
  const location = router.state.location
  return {
    /** 目前的路徑加 query，例如 /staff/1 */
    url: location.pathname + location.search,
    /** 在登入頁時是 redirect 參數的值（解碼後），不在登入頁是 null */
    loginRedirect: location.pathname === '/login' ? new URLSearchParams(location.search).get('redirect') : null,
    /** 這段文字有沒有在畫面上出現過（包括中途一閃而過） */
    everShown: (text: string) => [...seen, document.body.textContent ?? ''].some(t => t.includes(text)),
  }
}

export async function checkStaffGuard(makeRoute: MakeRoute) {
  // 店員進自己門市：看得到看板
  {
    await open(makeRoute, BARISTA, '/staff/1')
    expect(screen.queryByRole('heading', { name: '店員看板' }), '店員進自己門市要看得到看板').not.toBeNull()
  }

  // 沒登入：帶著原本的網址去登入頁，看板一次都沒出現
  {
    const r = await open(makeRoute, null, '/staff/1?view=compact')
    expect(r.loginRedirect, '沒登入要導到 /login?redirect=/staff/1?view=compact').toBe('/staff/1?view=compact')
    expect(r.everShown('店員看板'), '沒登入時看板不能出現').toBe(false)
  }

  // 顧客、別間門市：403，網址不變
  for (const [user, url] of [[CUSTOMER, '/staff/1']] as const) {
    const r = await open(makeRoute, user, url)
    expect(r.url, `${user.name} 進 ${url}：網址不變（不是導去登入頁）`).toBe(url)
    expect(screen.queryByRole('alert'), `${user.name} 進 ${url}：要顯示沒有權限`).not.toBeNull()
    expect(r.everShown('店員看板'), `${user.name} 進 ${url}：看板不能出現`).toBe(false)
  }
}
