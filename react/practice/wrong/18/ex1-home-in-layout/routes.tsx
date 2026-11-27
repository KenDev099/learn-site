import { NavLink, Outlet, type RouteObject } from 'react-router'
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
      <main>
        <Outlet />
      </main>
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
      <section>
        <AdminHome />
        <Outlet />
      </section>
    </div>
  )
}

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'menu', Component: MenuPage },
      { path: 'menu/:id', Component: ProductPage },
      {
        path: 'admin',
        Component: AdminLayout,
        children: [
          { path: 'orders', Component: OrdersPage },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
]
