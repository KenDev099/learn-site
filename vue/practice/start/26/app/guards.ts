// 練習 5-3：店員區的導航守衛（app/，第 20 課）
// 問題：起始版只檢查「有沒有登入」：顧客登入後打 /staff/1 就進得去；總店的店員把網址改成 /staff/2 就看到分店的看板；
//       沒登入被導去登入頁時也沒帶 redirect，登入後回不到原本的頁面。
// 要求：installGuards(router, auth) 只註冊一個 router.beforeEach，用回傳值決定結果（不要用第三個參數 next）
//   1. meta.requiresAuth 而且 auth.user 是 null → { name: "login", query: { redirect: to.fullPath } }
//   2. meta.roles 存在而且 user.role 不在裡面 → { name: "forbidden" }
//   3. meta.ownStore 是 true：user.storeId 要是數字，而且等於 Number(to.params.storeId)，否則 → { name: "forbidden" }
//   4. 其他情況放行（不回傳任何東西）
//   auth.user 每次導航都重新讀（登入、登出後它會變）
//   提醒：這裡只決定「畫面要不要讓你進去」，標成 ready 的 API 一定還要在伺服器檢查一次
import type { Router } from 'vue-router'
import type { Role, User } from '../features/staff/can.ts'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    roles?: Role[]
    ownStore?: boolean
  }
}

export type Auth = { readonly user: User | null }

export function installGuards(router: Router, auth: Auth) {
  router.beforeEach(to => {
    if (to.meta.requiresAuth && !auth.user) return { name: 'login' }
  })
}
