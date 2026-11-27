// 練習 5-2：路由表（app/，第 19、23 課）
// 問題：起始版在檔案最上面 import StaffPage：只有店員會用的看板，被打包進每個顧客都要下載的主 chunk。
// 要求：
//   1. createAppRouter(history) 用傳進來的 history 建立 router
//   2. 路由：/ 菜單（name "menu"）、/checkout 結帳（"checkout"）、/orders/:id 訂單狀態（"order-status"，id 轉成數字傳給 orderId）、
//      /login（"login"）、/403（"forbidden"）、/staff/:storeId（"staff"，storeId 只接受數字）
//   3. /staff/:storeId 用 () => import(...) 懶載入 StaffPage，打包後它要在自己的 chunk，主 chunk 不能有它的程式
//      菜單、結帳是大部分人一進來就會用的，維持靜態 import
//   4. /staff/:storeId 的 meta：{ requiresAuth: true, roles: ["barista", "manager"], ownStore: true }
//      （meta 的型別宣告在 guards.ts）
import { createRouter, type RouterHistory } from 'vue-router'
import MenuPage from '../features/menu/MenuPage.vue'
import CheckoutPage from '../features/checkout/CheckoutPage.vue'
import OrderStatusPage from '../features/orders/OrderStatusPage.vue'
import StaffPage from '../features/staff/StaffPage.vue'
import LoginPage from './LoginPage.vue'
import ForbiddenPage from './ForbiddenPage.vue'

export function createAppRouter(history: RouterHistory) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'menu', component: MenuPage },
      { path: '/checkout', name: 'checkout', component: CheckoutPage, props: { newKey: () => crypto.randomUUID() } },
      {
        path: '/orders/:id(\\d+)',
        name: 'order-status',
        component: OrderStatusPage,
        props: route => ({ orderId: Number(route.params.id) }),
      },
      { path: '/login', name: 'login', component: LoginPage },
      { path: '/403', name: 'forbidden', component: ForbiddenPage },
      { path: '/staff/:storeId(\\d+)', name: 'staff', component: StaffPage },
    ],
  })
}
