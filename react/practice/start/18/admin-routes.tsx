/*
練習 3：後台的登入守衛與權限
問題：守衛寫在 AdminLayout 的 effect 裡：沒登入的人進 /admin/orders，訂單已經抓了、也先畫出來一下，
      才被導去登入頁；登入頁也不知道登入後要回到哪裡。按上一頁又回到 /admin/orders，再被導走一次。
要求：adminRoute(auth, api) 回傳 path 是 'admin' 的路由（外面會把它放在 '/' 底下，和 /login 平行）
  1. /admin 底下每一頁（/admin、/admin/orders、/admin/prices）都要登入：auth.user 是 null 時
     導到 /login?redirect=<原本的路徑和查詢字串>，例如 /admin/orders?status=ready&page=2 →
     /login?redirect=%2Fadmin%2Forders%3Fstatus%3Dready%26page%3D2（用 URLSearchParams 編碼）。
     被擋下時，頁面一次都不能出現，loader 也不能執行（不能呼叫 api）
  2. 每次導航都要重新檢查：在後台時登出，再點後台選單的任何一頁，也要被導到登入頁
  3. /admin/orders 的 loader 呼叫 api.getOrders(登入者的 storeId, { signal: request.signal })，
     頁面列出每筆訂單（「顧客 $金額」）
  4. /admin/prices 只有店長（role 是 'manager'）能進：其他人 throw data('沒有權限', { status: 403 })，
     不呼叫 api.getPrices，畫面顯示 role="alert" 的「沒有權限」，外層頁首還在（不是導去登入頁）
  5. 被導去登入頁之後按上一頁，回到進後台之前的頁面（被擋下的網址不留在歷史紀錄裡）
提示：React Router 8 的 middleware 在 loader 之前、依父到子的順序執行，每次導航都會跑
*/
import { useEffect } from 'react'
import { NavLink, Outlet, useLoaderData, useNavigate, type RouteObject } from 'react-router'
import type { AdminApi, Auth, Order, PriceRow } from './admin-api.ts'

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

export function adminRoute(auth: Auth, api: AdminApi): RouteObject {
  function AdminLayout() {
    const navigate = useNavigate()
    useEffect(() => {
      if (!auth.user) navigate('/login')
    })
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
  return {
    path: 'admin',
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminHome },
      { path: 'orders', loader: ({ request }) => api.getOrders(auth.user?.storeId ?? 0, { signal: request.signal }), Component: OrdersPage },
      { path: 'prices', loader: ({ request }) => api.getPrices({ signal: request.signal }), Component: PricesPage },
    ],
  }
}
