// 練習 2 的路由表。這個檔案不用改
import type { RouteObject } from 'react-router'
import { ShopLayout } from './ShopLayout.tsx'
import { CartPage, MenuPage } from './pages.tsx'

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: ShopLayout,
    children: [
      { path: 'menu', Component: MenuPage },
      { path: 'cart', Component: CartPage },
    ],
  },
]
