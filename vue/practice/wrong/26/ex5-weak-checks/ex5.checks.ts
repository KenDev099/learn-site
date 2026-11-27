/*
  練習 5-4：替店員區的守衛寫檢查（第 22 課的方式）
  問題：起始版只檢查「沒登入會到登入頁」，其他規則壞掉都抓不到。
  要求：完成 checkStaffGuard(installGuards)：守衛不符合 guards.ts 開頭的規格時丟錯，符合時正常結束。
  - 每個情境用 setup(installGuards, user) 建立新的 router 和 auth，不要放在函式外面共用
  - 用 await router.push(...) 導航，看 router.currentRoute.value 的 name、query
  - 至少要檢查：沒登入 → login 並帶 redirect、顧客 → forbidden、
    總店（storeId 1）的店員和店長進得了 /staff/1、總店店員去 /staff/2 → forbidden、沒有 storeId 的店員 → forbidden
  判分：2 個寫法不同的正確版本要正常結束，4 個錯誤版本都要丟錯（你自己的 guards.ts 也會被拿來檢查）。
*/
import { expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import type { Auth } from './app/guards.ts'
import type { User } from './features/staff/can.ts'

type InstallGuards = (router: Router, auth: Auth) => void

const page = (name: string) => defineComponent({ name, render: () => h('p', name) })

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'menu', component: page('Menu') },
  { path: '/login', name: 'login', component: page('Login') },
  { path: '/403', name: 'forbidden', component: page('Forbidden') },
  {
    path: '/staff/:storeId(\\d+)',
    name: 'staff',
    component: page('Staff'),
    meta: { requiresAuth: true, roles: ['barista', 'manager'], ownStore: true },
  },
]

export const CUSTOMER: User = { id: 1, name: '王小明', role: 'customer' }
export const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 1 }
export const MANAGER: User = { id: 3, name: '林志豪', role: 'manager', storeId: 1 }
export const NO_STORE: User = { id: 4, name: '張雅婷', role: 'barista' }

// 每次呼叫都是全新的 router 和 auth：情境之間不會互相影響
export function setup(installGuards: InstallGuards, user: User | null) {
  const auth: Auth = { user }
  const router = createRouter({ history: createMemoryHistory(), routes })
  installGuards(router, auth)
  return router
}

export async function checkStaffGuard(installGuards: InstallGuards) {
  const router = setup(installGuards, null)
  await router.push('/staff/1')
  expect(router.currentRoute.value.name, '沒登入去店員區要到登入頁').toBe('login')
}
