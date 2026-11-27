/*
練習 4（上）：店員區的守衛（第 18 課的 middleware）
驗收條件：staffRoute(auth, api) 回傳 /staff/:storeId 的路由，加上 middleware：
  1. 沒登入：導到 /login?redirect=<原本的路徑與 query>（redirect 的值用 URLSearchParams 編碼）
  2. 登入了但角色是顧客（customer）：throw data('沒有權限', { status: 403 })，網址不變、畫面顯示 StaffError
  3. 店員、店長只能進自己門市的看板：網址的 storeId 不是數字、或跟 user.storeId 不同，也是 403
  4. 擋下時看板一次都不能出現、api.getStoreOrders 不能被呼叫
  這一層是體驗，真正的權限檢查在伺服器：API 會再檢查一次
*/
import { isRouteErrorResponse, useRouteError, type RouteObject } from 'react-router'
import type { Auth, ShopApi } from '../../shared/api.ts'
import { StaffBoard } from './StaffBoard.tsx'

function StaffError() {
  const error = useRouteError()
  return <p role="alert">{isRouteErrorResponse(error) && error.status === 403 ? '沒有權限' : '載入失敗'}</p>
}

// 原型：還沒有任何守衛，誰都進得來
export function staffRoute(_auth: Auth, api: Pick<ShopApi, 'getStoreOrders' | 'markReady'>): RouteObject {
  return {
    path: 'staff/:storeId',
    Component: () => <StaffBoard api={api} />,
    ErrorBoundary: StaffError,
  }
}
