import {
  createContext, data, isRouteErrorResponse, NavLink, Outlet, redirect, useLoaderData, useRouteError,
  type MiddlewareFunction, type RouteObject,
} from 'react-router'
import type { AdminApi, Auth, Order, PriceRow, User } from './admin-api.ts'

// 路由的 context（不是 React 的 createContext）：middleware 放進去，底下的 loader 拿出來
const userContext = createContext<User>()

function AdminLayout() {
  return (
    <div>
      <nav aria-label="後台選單">
        <NavLink to="/admin" end>總覽</NavLink>
        <NavLink to="/admin/orders">訂單</NavLink>
        <NavLink to="/admin/prices">價目表</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}

function AdminHome() {
  return <h1>後台總覽</h1>
}

function OrdersPage() {
  const orders = useLoaderData<Order[]>()
  return (
    <>
      <h1>訂單列表</h1>
      <ul>{orders.map(o => <li key={o.id}>{o.customer} ${o.total}</li>)}</ul>
    </>
  )
}

function PricesPage() {
  const rows = useLoaderData<PriceRow[]>()
  return (
    <>
      <h1>價目表</h1>
      <ul>{rows.map(r => <li key={r.name}>{r.name} ${r.price}</li>)}</ul>
    </>
  )
}

function AdminError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 403) return <p role="alert">沒有權限</p>
  return <p role="alert">載入失敗</p>
}

export function adminRoute(auth: Auth, api: AdminApi): RouteObject {
  const requireUser: MiddlewareFunction = ({ url, context }) => {
    const user = auth.user
    if (!user) throw redirect(`/login?${new URLSearchParams({ redirect: url.pathname + url.search })}`)
    context.set(userContext, user)
  }
  const requireManager: MiddlewareFunction = ({ context }) => {
    if (context.get(userContext).role !== 'manager') throw data('沒有權限', { status: 403 })
  }

  return {
    path: 'admin',
    middleware: [requireUser],
    Component: AdminLayout,
    ErrorBoundary: AdminError,
    children: [
      { index: true, Component: AdminHome },
      {
        path: 'orders',
        loader: ({ request, context }) => api.getOrders(context.get(userContext).storeId, { signal: request.signal }),
        Component: OrdersPage,
      },
      {
        path: 'prices',
        middleware: [requireManager],
        loader: ({ request }) => api.getPrices({ signal: request.signal }),
        Component: PricesPage,
      },
    ],
  }
}
