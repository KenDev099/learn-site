/*
  練習 3 的受測程式（已經寫好，不用改）：第 20 課的全域導航守衛
  規格（你的檢查只能依賴這裡寫的東西，判分時會換成寫法不同的另一個正確版本）：
  installGuards(router, auth) 在 router 上註冊守衛：
  - 第一次導航前先等 auth.loadMe() 完成；之後的導航都共用同一次，loadMe 總共只呼叫一次
  - meta.requiresAuth 而且沒登入 → 導向 name 'login'，query.redirect 是原本要去的 fullPath
  - meta.permission 存在而且 hasPermission(auth.user, permission) 是 false → 導向 name 'forbidden'（沒登入先去登入）
  - 已登入的人要去 name 是 'login' 的頁面 → 導向 '/'
  - 其他情況放行；登入頁、403 頁沒有 requiresAuth，不會互相導來導去
*/
import type { Router } from 'vue-router'
import { hasPermission, type Permission, type User } from './permissions.ts'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    permission?: Permission
  }
}

export type Auth = {
  readonly user: User | null
  loadMe(): Promise<void>
}

export function installGuards(router: Router, auth: Auth) {
  let ready: Promise<void> | null = null

  router.beforeEach(async (to) => {
    ready ??= auth.loadMe()
    await ready

    const user = auth.user
    if (to.meta.requiresAuth && !user) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.permission && !hasPermission(user, to.meta.permission)) {
      return { name: 'forbidden' }
    }
    if (to.name === 'login' && user) return '/'
  })
}
