// 測試共用：用 createMemoryRouter 架一個只存在記憶體的路由器（不碰瀏覽器網址），外面包一層測試用的版面
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation, type RouteObject } from 'react-router'

/** 測試用的外層版面：頁首、目前網址、底下放題目的路由 */
function Shell() {
  const location = useLocation()
  return (
    <>
      <header>
        <p>測試頁首</p>
        <output aria-label="網址">{location.pathname}{location.search}</output>
        <Link to="/">回首頁</Link>
      </header>
      <Outlet />
    </>
  )
}

/** 把題目的路由放在測試版面底下：'/' 是首頁，另外加上 /login 與 /menu 兩個簡單的頁面 */
export function withShell(children: RouteObject[]): RouteObject[] {
  return [{
    path: '/',
    Component: Shell,
    HydrateFallback: () => <p>準備中…</p>,
    ErrorBoundary: () => <p role="alert">外層錯誤</p>,
    children: [
      { index: true, Component: () => <h1>首頁</h1> },
      { path: 'login', Component: () => <h1>登入頁</h1> },
      ...children,
    ],
  }]
}

export function renderRoutes(routes: RouteObject[], ...entries: string[]) {
  const router = createMemoryRouter(routes, { initialEntries: entries, initialIndex: entries.length - 1 })
  const view = render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup(), ...view }
}

/** 等 loader、React 把畫面更新完 */
export const settle = () => act(async () => {
  for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0))
})

/** 目前的網址（解碼後），例如 /login?redirect=/admin */
export const currentUrl = () => decodeURIComponent(screen.getByRole('status', { name: '網址' }).textContent ?? '')

/** 從現在起記錄畫面上出現過的所有文字：用來確認某段內容「一次都沒出現過」 */
export function recordTexts() {
  const seen: string[] = [document.body.textContent ?? '']
  const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''))
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  return {
    everShown: (text: string) => { seen.push(document.body.textContent ?? ''); return seen.some(t => t.includes(text)) },
    stop: () => observer.disconnect(),
  }
}
