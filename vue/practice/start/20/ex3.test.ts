import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { deferred } from '../../helpers/deferred.ts'
import { installGuards, type Auth } from './guards.ts'
import type { User } from './permissions.ts'

const page = (name: string) => defineComponent({ name, render: () => h('p', name) })

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: page('Home') },
  { path: '/login', name: 'login', component: page('Login') },
  { path: '/403', name: 'forbidden', component: page('Forbidden') },
  { path: '/orders', name: 'orders', component: page('Orders'), meta: { requiresAuth: true } },
  { path: '/board', name: 'board', component: page('Board'), meta: { requiresAuth: true, permission: 'orders:board' } },
  {
    path: '/admin',
    meta: { requiresAuth: true, permission: 'menu:edit' },
    children: [{ path: 'menu', name: 'admin-menu', component: page('AdminMenu') }],
  },
]

const CUSTOMER: User = { id: 1, name: '王小明', role: 'customer' }
const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 1 }
const MANAGER: User = { id: 3, name: '林志豪', role: 'manager', storeId: 1 }

// 假的 auth：loadMe 模擬呼叫 /me，完成後才知道是誰（manual 時由測試決定什麼時候完成）
function setup(me: User | null, { manual = false } = {}) {
  const gate = deferred()
  const auth = {
    user: null as User | null,
    loadMe: vi.fn(async () => {
      if (manual) await gate.promise
      auth.user = me
    }),
  } satisfies Auth
  const router = createRouter({ history: createMemoryHistory(), routes })
  // 保險絲：先註冊的守衛先執行。導向迴圈時 redirect 參數越包越長，vue-router 偵測不到，會永遠繞下去
  let navigations = 0
  router.beforeEach(() => {
    if (++navigations > 40) { looped = true; return false }
  })
  installGuards(router, auth)
  return { router, auth, gate }
}

// 讓已經開始的導航跑到「卡在 await loadMe()」的地方
const settle = () => new Promise(r => setTimeout(r, 0))

const at = (router: ReturnType<typeof setup>['router']) => router.currentRoute.value

// vue-router 的開發模式警告（next 已不建議使用、next 呼叫兩次、無限導向）都印在 console.warn
let warn: MockInstance<typeof console.warn>
let looped = false
beforeEach(() => {
  looped = false
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  expect(looped, '出現導向迴圈：導航一直被導向別的頁面停不下來。只有 meta.requiresAuth 的頁面才導向登入，登入頁、403 頁要能直接進去').toBe(false)
  const routerWarnings = warn.mock.calls.map(args => args.join(' ')).filter(s => /VUE_ROUTER|Vue Router/i.test(s))
  expect(routerWarnings, `vue-router 發出警告：${routerWarnings[0]?.slice(0, 200)}。守衛不要用第三個參數 next，直接 return false、路由位置或什麼都不回傳`).toEqual([])
})

describe('練習 3：全域導航守衛', () => {
  test('沒登入去需要登入的頁面 → 登入頁，並帶上完整的回跳網址', async () => {
    const { router } = setup(null)
    await router.push('/orders?status=ready&page=2#top')
    expect(at(router).name, '沒登入去 requiresAuth 的頁面要導向 { name: \'login\' }').toBe('login')
    expect(at(router).query.redirect, '要帶 query.redirect = to.fullPath（包含 ?status=ready&page=2#top）。用 { name: \'login\', query: { redirect: to.fullPath } } 讓 vue-router 編碼，不要自己用字串接網址：& 和 # 會被當成登入頁自己的參數').toBe('/orders?status=ready&page=2#top')
  })

  test('沒登入時，登入頁、403、首頁都進得去（沒有導向迴圈）', async () => {
    const { router } = setup(null)
    await router.push('/login')
    expect(at(router).name, '沒登入去登入頁要能進去：只有 meta.requiresAuth 的頁面才導向登入，否則登入頁也會被導向登入頁，形成迴圈').toBe('login')
    await router.push('/403')
    expect(at(router).name, '403 頁不需要登入').toBe('forbidden')
    await router.push('/')
    expect(at(router).name, '首頁不需要登入').toBe('home')
  })

  test('權限不足 → 403；子路由也繼承父路由的 meta', async () => {
    const { router } = setup(BARISTA)
    await router.push('/board')
    expect(at(router).name, '店員有 orders:board 權限，要能進吧台看板').toBe('board')
    await router.push('/admin/menu')
    expect(at(router).name, '店員沒有 menu:edit：要導向 { name: \'forbidden\' }。to.meta 會合併父路由的 meta，直接讀 to.meta.permission').toBe('forbidden')
  })

  test('有權限就放行；顧客進不了吧台看板', async () => {
    const manager = setup(MANAGER)
    await manager.router.push('/admin/menu')
    expect(at(manager.router).name, '店長有 menu:edit，要能進菜單管理').toBe('admin-menu')
    const customer = setup(CUSTOMER)
    await customer.router.push('/board')
    expect(at(customer.router).name, '顧客沒有 orders:board，要導向 403').toBe('forbidden')
  })

  test('沒登入去需要權限的頁面 → 先去登入，不是 403', async () => {
    const { router } = setup(null)
    await router.push('/admin/menu')
    expect(at(router).name, '還不知道是誰之前談不上權限：先檢查登入（導向 login），已登入才檢查權限').toBe('login')
    expect(at(router).query.redirect).toBe('/admin/menu')
  })

  test('已登入再去登入頁 → 回首頁', async () => {
    const { router } = setup(CUSTOMER)
    await router.push('/login')
    expect(at(router).fullPath, '已登入的人去 login 要導向 \'/\'').toBe('/')
  })

  test('第一次導航會等 loadMe 完成；之後不再呼叫', async () => {
    const { router, auth, gate } = setup(MANAGER, { manual: true })
    const first = router.push('/orders')
    await settle()
    expect(auth.loadMe, '第一次導航時要呼叫 auth.loadMe()').toHaveBeenCalledTimes(1)
    expect(at(router).name, 'loadMe 還沒完成，導航不能先結束：守衛要 await loadMe()').toBeUndefined()
    gate.resolve()
    await first
    expect(at(router).name, '已登入的店長重新整理後被導到別的頁面：守衛要先 await loadMe() 完成，再看 auth.user').toBe('orders')
    await router.push('/board')
    await router.push('/admin/menu')
    expect(auth.loadMe, '每次導航都呼叫 loadMe（等於每換一頁就打一次 /me）：只在第一次呼叫，之後沿用').toHaveBeenCalledTimes(1)
  })

  test('loadMe 還沒完成時又開始第二次導航：兩次共用同一次 loadMe', async () => {
    const { router, auth, gate } = setup(BARISTA, { manual: true })
    const a = router.push('/orders')
    await settle()
    const b = router.push('/board')
    await settle()
    gate.resolve()
    await Promise.allSettled([a, b])
    expect(auth.loadMe, 'loadMe 被呼叫兩次：用 boolean 記「載入過了」擋不住同時進行的導航。把 loadMe() 回傳的 Promise 存起來，大家 await 同一個').toHaveBeenCalledTimes(1)
    expect(at(router).name, '後開始的導航要生效').toBe('board')
  })

  test('每次都讀最新的 auth.user（登出後要再登入）', async () => {
    const { router, auth } = setup(MANAGER)
    await router.push('/orders')
    expect(at(router).name).toBe('orders')
    auth.user = null   // 登出
    await router.push('/board')
    expect(at(router).name, '登出後還進得去：守衛每次都要讀 auth.user，不要在 install 或第一次導航時存成常數').toBe('login')
  })
})
