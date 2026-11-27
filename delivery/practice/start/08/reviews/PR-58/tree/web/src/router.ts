import { createRouter, createWebHistory } from 'vue-router'
import MenuPage from './pages/MenuPage.vue'
import CheckoutPage from './pages/CheckoutPage.vue'
import OrderStatusPage from './pages/OrderStatusPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: MenuPage },
    { path: '/checkout', component: CheckoutPage },
    { path: '/orders/:id', component: OrderStatusPage, props: route => ({ id: Number(route.params.id) }) },
  ],
})
