/*
練習 1：咖啡店的路由表（巢狀路由與版面）
問題：現在只有一條 '/' 路由，不管網址是什麼都只看到頁首，客人沒辦法分享商品頁的網址。
要求（頁面元件在 pages.tsx，不用改）：
  1. '/' 用 Layout 當版面：頁首（主選單、搜尋草稿輸入框）一直在，頁面內容顯示在 <main> 裡
       /           → Home（歡迎光臨）
       /menu       → MenuPage
       /menu/:id   → ProductPage（顯示「商品 #id」）
  2. /admin 是 Layout 裡的第二層版面 AdminLayout：左邊的後台選單一直在，內容顯示在 <section> 裡
       /admin         → AdminHome（後台總覽）
       /admin/orders  → OrdersPage
  3. 其他任何網址（包括 /admin/nope）顯示 NotFound，而且頁首還在
  4. 換頁時版面不重建：在頁首的搜尋草稿打到一半，點選單換頁，打的字還在；
     在後台的兩頁之間切換，後台選單也是同一個（不是重新建立的）
  5. routes 是 createMemoryRouter / createBrowserRouter 收的路由陣列，元件用 Component 指定
*/
import { NavLink, type RouteObject } from 'react-router'
import { AdminHome, Home, MenuPage, NotFound, OrdersPage, ProductPage } from './pages.tsx'

export function Layout() {
  return (
    <>
      <header>
        <nav aria-label="主選單">
          <NavLink to="/">首頁</NavLink>
          <NavLink to="/menu">菜單</NavLink>
          <NavLink to="/menu/2">今日推薦</NavLink>
          <NavLink to="/admin">後台</NavLink>
        </nav>
        <input aria-label="搜尋草稿" />
      </header>
      <main></main>
    </>
  )
}

export function AdminLayout() {
  return (
    <div>
      <nav aria-label="後台選單">
        <NavLink to="/admin" end>總覽</NavLink>
        <NavLink to="/admin/orders">訂單</NavLink>
      </nav>
      <section></section>
    </div>
  )
}

export const routes: RouteObject[] = [
  { path: '/', Component: Layout },
]
