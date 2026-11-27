import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Router } from 'vue-router'
import { installGuards, type Auth } from './guards.ts'
import { hasPermission } from './permissions.ts'
import { checkGuards } from './ex3.checks.ts'

type Install = (router: Router, auth: Auth) => void

// 另一種寫法：看 to.matched、把規則拆成小函式
const correctB: Install = (router, auth) => {
  let loading: Promise<void> | undefined
  const needsLogin = (to: Parameters<Parameters<Router['beforeEach']>[0]>[0]) => to.matched.some(r => r.meta.requiresAuth)
  router.beforeEach(async to => {
    if (!loading) loading = auth.loadMe()
    await loading
    const user = auth.user
    if (!user) return needsLogin(to) ? { name: 'login', query: { redirect: to.fullPath } } : true
    if (to.name === 'login') return { path: '/' }
    if (to.meta.permission && !hasPermission(user, to.meta.permission)) return { name: 'forbidden' }
    return true
  })
}

// 錯誤版本：照正確版本寫，各改壞一個地方
function wrong(kind: 'noRedirect' | 'pathOnly' | 'loop' | 'loadEveryTime' | 'noPermission' | 'denyAll' | 'permissionFirst' | 'loginWhenLoggedIn'): Install {
  return (router, auth) => {
    let ready: Promise<void> | null = null
    router.beforeEach(async to => {
      if (kind === 'loadEveryTime') await auth.loadMe()
      else await (ready ??= auth.loadMe())
      const user = auth.user
      if (kind === 'loop' && !user) return { name: 'login' }   // 連登入頁本身也導向登入頁
      if (kind === 'denyAll' && user && to.meta.permission) return { name: 'forbidden' }   // 有權限的人也進不去
      if (kind === 'permissionFirst' && to.meta.permission && !hasPermission(user, to.meta.permission)) return { name: 'forbidden' }   // 沒登入先被送去 403
      if (to.meta.requiresAuth && !user) {
        if (kind === 'noRedirect') return { name: 'login' }
        return { name: 'login', query: { redirect: kind === 'pathOnly' ? to.path : to.fullPath } }   // pathOnly：掉了 ?status=ready
      }
      if (kind !== 'noPermission' && to.meta.permission && !hasPermission(user, to.meta.permission)) return { name: 'forbidden' }
      if (kind !== 'loginWhenLoggedIn' && to.name === 'login' && user) return '/'
    })
  }
}

const WRONG: [string, Install][] = [
  ['導向登入頁時沒帶 redirect', wrong('noRedirect')],
  ['redirect 只有 path，掉了 query 字串', wrong('pathOnly')],
  ['沒登入時連登入頁也導向登入頁（導向迴圈）', wrong('loop')],
  ['每次導航都呼叫 loadMe', wrong('loadEveryTime')],
  ['沒檢查權限', wrong('noPermission')],
  ['有權限的人也被擋到 403', wrong('denyAll')],
  ['沒登入去需要權限的頁面，被送到 403 而不是登入頁', wrong('permissionFirst')],
  ['已登入還能進登入頁', wrong('loginWhenLoggedIn')],
]

async function run(install: Install) {
  try {
    await checkGuards(install)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  }
}

// 導向迴圈的版本會讓 vue-router 印警告，這裡先關掉，不影響判分
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('練習 3：導航守衛的檢查', () => {
  test('正確版本 A（guards.ts）要通過', async () => {
    const error = await run(installGuards)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}`).toBeNull()
  })

  test('正確版本 B（寫法不同）要通過；先檢查過 A 也不能影響 B', async () => {
    await run(installGuards)
    const error = await run(correctB)
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。每個情境都要建立新的 router 和 auth，不要放在函式外面共用`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, install) => {
    const error = await run(install)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })
})
