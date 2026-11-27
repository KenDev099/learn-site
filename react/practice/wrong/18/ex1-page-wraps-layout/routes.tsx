import type { ComponentType, ReactNode } from 'react'
import { NavLink, Outlet, type RouteObject } from 'react-router'
import { AdminHome, Home, MenuPage, NotFound, OrdersPage, ProductPage } from './pages.tsx'

// 錯誤寫法：每一頁各包一次版面（每個 Page 都是不同的元件型別），換頁時整個版面被重建
function Frame({ children }: { children: ReactNode }) {
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
      <main>{children}</main>
    </>
  )
}
function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav aria-label="後台選單">
        <NavLink to="/admin" end>總覽</NavLink>
        <NavLink to="/admin/orders">訂單</NavLink>
      </nav>
      <section>{children}</section>
    </div>
  )
}
const page = (Page: ComponentType) => function WithLayout() { return <Frame><Page /></Frame> }
const adminPage = (Page: ComponentType) => function WithAdmin() { return <Frame><AdminFrame><Page /></AdminFrame></Frame> }

export function Layout() {
  return <Outlet />
}
export function AdminLayout() {
  return <Outlet />
}

export const routes: RouteObject[] = [
  { path: '/', Component: page(Home) },
  { path: '/menu', Component: page(MenuPage) },
  { path: '/menu/:id', Component: page(ProductPage) },
  { path: '/admin', Component: adminPage(AdminHome) },
  { path: '/admin/orders', Component: adminPage(OrdersPage) },
  { path: '*', Component: page(NotFound) },
]
