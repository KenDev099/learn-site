/*
  練習 3：全域導航守衛
  問題：起始版只看 auth.user，但重新整理頁面時 user 還沒從伺服器載入（loadMe 還沒跑），
        已經登入的店長一重新整理就被踢回登入頁；也沒有處理權限、回跳網址和「已登入又去登入頁」。
  要求（installGuards(router, auth) 裡只註冊 router.beforeEach，用回傳值決定結果，不要用第三個參數 next）：
  - 第一次導航前先等 auth.loadMe() 完成；之後的導航（包括同時開始的兩次導航）都共用同一次，loadMe 總共只呼叫一次
  - meta.requiresAuth 而且沒登入 → { name: 'login', query: { redirect: to.fullPath } }
  - meta.permission 存在而且 hasPermission(auth.user, permission) 是 false → { name: 'forbidden' }（已登入才看權限，沒登入先去登入）
  - 已登入的人要去 name 是 'login' 的頁面 → '/'
  - 其他情況放行（不回傳任何東西）
  - 登入頁、403 頁本身沒有 requiresAuth，守衛也不能讓它們互相導來導去（不能有導向迴圈）
  auth.user 每次都從 auth 讀：登出、登入後它會變
*/
import type { Router } from 'vue-router'
import { hasPermission, type Permission, type User } from './permissions.ts'

// 為 route meta 加型別（module augmentation）：寫錯欄位名稱或權限字串時，vue-tsc 會報錯
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
  // 存「載入中的 Promise」而不是 boolean：同時開始的兩次導航也會等同一個
  let ready: Promise<void> | null = null

  router.beforeEach(async (to) => {
    ready ??= auth.loadMe()
    await ready

    const user = auth.user
    if (!user && to.name !== 'forbidden') {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.permission && !hasPermission(user, to.meta.permission)) {
      return { name: 'forbidden' }
    }
    if (to.name === 'login' && user) return '/'
  })
}
