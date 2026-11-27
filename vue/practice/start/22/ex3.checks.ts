/*
  練習 3：替第 20 課的導航守衛寫檢查
  問題：起始版只檢查「沒登入去 /orders 會到登入頁」，其他規則壞掉都抓不到。
  要求：完成 checkGuards(installGuards)：守衛不符合 guards.ts 開頭的規格時丟錯，符合時正常結束。
  - 每個情境用 setup() 建立新的 router（createMemoryHistory）和新的假 auth，再呼叫 installGuards(router, auth)
  - 用 await router.push(...) 導航，看 router.currentRoute.value 的 name、query、fullPath
  - 檢查：沒登入 → login 並帶 redirect（含 query 字串）、沒登入去需要權限的頁面也是先到 login、
          沒登入可以進登入頁和 403 頁、
          權限不足 → forbidden、有權限可以進、已登入去登入頁 → '/'、多次導航 loadMe 只呼叫一次
  - 不要把 router 或 auth 放在函式外面共用：判分時同一個檔案會連續檢查好幾個版本
  判分：2 個正確版本要正常結束，8 個錯誤版本都要丟錯。
*/
import { expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import type { Auth } from './guards.ts'
import type { User } from './permissions.ts'

type InstallGuards = (router: Router, auth: Auth) => void

const page = (name: string) => defineComponent({ name, render: () => h('p', name) })

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: page('Home') },
  { path: '/login', name: 'login', component: page('Login') },
  { path: '/403', name: 'forbidden', component: page('Forbidden') },
  { path: '/orders', name: 'orders', component: page('Orders'), meta: { requiresAuth: true } },
  { path: '/board', name: 'board', component: page('Board'), meta: { requiresAuth: true, permission: 'orders:board' } },
  { path: '/admin/menu', name: 'admin-menu', component: page('AdminMenu'), meta: { requiresAuth: true, permission: 'menu:edit' } },
]

const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 1 }
const MANAGER: User = { id: 3, name: '林志豪', role: 'manager', storeId: 1 }

// 每次呼叫都是全新的 router 和 auth：情境之間不會互相影響
function setup(installGuards: InstallGuards, me: User | null) {
  const auth = {
    user: null as User | null,
    loadMe: vi.fn(async () => { auth.user = me }),
  }
  const router = createRouter({ history: createMemoryHistory(), routes })
  installGuards(router, auth)
  return { router, auth }
}

export async function checkGuards(installGuards: InstallGuards) {
  const { router } = setup(installGuards, null)
  await router.push('/orders')
  expect(router.currentRoute.value.name, '沒登入去 /orders 要到登入頁').toBe('login')
  // 在這裡寫其他規則的檢查：每個情境呼叫一次 setup()
}
