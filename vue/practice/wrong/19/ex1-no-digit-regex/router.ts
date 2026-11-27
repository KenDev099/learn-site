// 練習 1：咖啡店的路由表
// 問題：目前只有首頁和菜單，其他網址都是一片空白；商品頁、訂單區還沒接上。
// 要求：
//   1. createAppRouter(history) 用傳進來的 history 建立 router（正式環境傳 createWebHistory()，測試傳 createMemoryHistory()）
//   2. 每條路由都要有名稱：home、menu、product、orders、order-list、order-detail、not-found
//   3. /menu/:id 顯示 ProductPage；id 只接受數字（/menu/abc 要落到找不到頁面），
//      用 props 函式把 id 轉成數字傳給 ProductPage，ProductPage 收到的 id 要是 number，不是字串
//   4. /orders 顯示 OrdersLayout，子路由：''（空字串）顯示 OrderList、':orderId' 顯示 OrderDetail（orderId 也轉成數字、只接受數字）
//      子路由的 path 不要以 / 開頭，否則會變成根路徑 /:orderId
//   5. 其他所有路徑顯示 NotFound（用 /:pathMatch(.*)*），網址不變
import { createRouter, type RouterHistory } from 'vue-router'
import HomePage from './HomePage.vue'
import MenuPage from './MenuPage.vue'
import ProductPage from './ProductPage.vue'
import OrdersLayout from './OrdersLayout.vue'
import OrderList from './OrderList.vue'
import OrderDetail from './OrderDetail.vue'
import NotFound from './NotFound.vue'

export function createAppRouter(history: RouterHistory) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomePage },
      { path: '/menu', name: 'menu', component: MenuPage },
      {
        path: '/menu/:id',
        name: 'product',
        component: ProductPage,
        props: route => ({ id: Number(route.params.id) }),
      },
      {
        path: '/orders',
        name: 'orders',
        component: OrdersLayout,
        children: [
          { path: '', name: 'order-list', component: OrderList },
          {
            path: ':orderId(\\d+)',
            name: 'order-detail',
            component: OrderDetail,
            props: route => ({ orderId: Number(route.params.orderId) }),
          },
        ],
      },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound },
    ],
  })
}
