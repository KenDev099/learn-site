// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createMemoryHistory, type Router } from 'vue-router'
import { can, type Action, type User } from './features/staff/can.ts'
import { installGuards, type Auth } from './app/guards.ts'
import { createAppRouter } from './app/router.ts'
import { BARISTA, CUSTOMER, MANAGER, NO_STORE, checkStaffGuard, setup } from './ex5.checks.ts'

type Install = (router: Router, auth: Auth) => void

describe('練習 5：店員區', () => {
  describe('5-1 can()', () => {
    const mine = { customerId: 1, storeId: 1, status: 'received' as const }
    const brewing = { ...mine, status: 'brewing' as const }
    const otherStore = { ...mine, customerId: 6, storeId: 2 }
    const noStore = { customerId: 6, status: 'received' as const }
    const managerNoStore: User = { id: 9, name: '李建國', role: 'manager' }
    const CASES: [string, User | null, Action, typeof mine | typeof brewing | typeof otherStore | typeof noStore, boolean][] = [
      ['顧客看自己的訂單', CUSTOMER, 'order:view', mine, true],
      ['顧客看別人的訂單', CUSTOMER, 'order:view', otherStore, false],
      ['顧客取消自己 received 的訂單', CUSTOMER, 'order:cancel', mine, true],
      ['顧客取消已在製作的訂單', CUSTOMER, 'order:cancel', brewing, false],
      ['顧客標成 ready', CUSTOMER, 'order:ready', mine, false],
      ['店員把自己門市的訂單標成 ready', BARISTA, 'order:ready', mine, true],
      ['店員把別間門市的訂單標成 ready', BARISTA, 'order:ready', otherStore, false],
      ['店員取消訂單', BARISTA, 'order:cancel', mine, false],
      ['店長取消自己門市的訂單', MANAGER, 'order:cancel', mine, true],
      ['店長動別間門市的訂單', MANAGER, 'order:ready', otherStore, false],
      ['沒有 storeId 的店長動沒有 storeId 的訂單', managerNoStore, 'order:ready', noStore, false],
      ['沒有 storeId 的店員看沒有 storeId 的訂單', NO_STORE, 'order:view', noStore, false],
      ['沒登入', null, 'order:view', mine, false],
      ['不認得的動作', MANAGER, 'order:delete' as Action, mine, false],
      ['不認得的角色', { id: 5, name: '黃淑芬', role: 'owner' as User['role'], storeId: 1 }, 'order:view', mine, false],
    ]
    test.each(CASES)('%s → %s', (name, user, action, order, expected) => {
      const hint = name.includes('storeId') ? '：undefined === undefined 是 true，先確認 storeId 是數字再比較' : ''
      expect(can(user, action, order), `${name} 應該是 ${expected}${hint}`).toBe(expected)
    })
  })

  describe('5-2 路由與懶載入', () => {
    test('/staff/:storeId 的 meta 與其他路由', () => {
      const router = createAppRouter(createMemoryHistory())
      const staff = router.resolve('/staff/1')
      expect(staff.name, '/staff/1 要對到 name 為 staff 的路由').toBe('staff')
      expect(staff.meta, 'meta 要是 { requiresAuth: true, roles: [barista, manager], ownStore: true }').toEqual({ requiresAuth: true, roles: ['barista', 'manager'], ownStore: true })
      expect(router.resolve('/staff/abc').name, 'storeId 只接受數字').not.toBe('staff')
      expect(router.resolve('/orders/42').name).toBe('order-status')
      expect(router.resolve('/').name).toBe('menu')
    })

    test('打包後 StaffPage 在自己的 chunk，主 chunk 沒有它', async () => {
      const dir = import.meta.dirname
      const result = await build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [vue()],
        build: {
          write: false,
          // preserveEntrySignatures：保留 router.ts 的 export，不然 createAppRouter 沒人用，整個被 tree-shake 掉
          rolldownOptions: { input: join(dir, 'app/router.ts'), preserveEntrySignatures: 'strict' },
        },
      })
      const outputs = (Array.isArray(result) ? result : [result]) as { output: { type: string; isEntry?: boolean; isDynamicEntry?: boolean; code?: string }[] }[]
      const chunks = outputs.flatMap(o => o.output).filter(c => c.type === 'chunk')
      const entry = chunks.find(c => c.isEntry)!
      expect(entry.code, '主 chunk 裡有 StaffPage 的程式：/staff 要用 component: () => import(...) 懶載入，檔案開頭不能 import StaffPage').not.toContain('staff-board')
      expect(chunks.some(c => c.isDynamicEntry && c.code?.includes('staff-board')), 'StaffPage 要被拆成自己的 chunk').toBe(true)
      expect(entry.code, '菜單頁是大部分人一進來就要看的，維持在主 chunk').toContain('找不到符合的商品')
    }, 30_000)
  })

  describe('5-3 守衛', () => {
    test('你的 installGuards 符合規格', async () => {
      {
        const router = setup(installGuards, null)
        await router.push('/staff/1?tab=new')
        expect(router.currentRoute.value.name, '沒登入要到登入頁').toBe('login')
        expect(router.currentRoute.value.query.redirect, '要帶 redirect: to.fullPath，登入後才回得來').toBe('/staff/1?tab=new')
      }
      {
        const router = setup(installGuards, CUSTOMER)
        await router.push('/staff/1')
        expect(router.currentRoute.value.name, '顧客不在 meta.roles 裡，要到 forbidden').toBe('forbidden')
      }
      for (const user of [BARISTA, MANAGER]) {
        const router = setup(installGuards, user)
        await router.push('/staff/1')
        expect(router.currentRoute.value.name, `${user.role} 要進得了自己門市的店員區`).toBe('staff')
        await router.push('/staff/2')
        expect(router.currentRoute.value.name, `${user.role} 去別間門市要到 forbidden（meta.ownStore）`).toBe('forbidden')
      }
      {
        const router = setup(installGuards, NO_STORE)
        await router.push('/staff/1')
        expect(router.currentRoute.value.name, '沒有 storeId 的店員要到 forbidden').toBe('forbidden')
        await router.push('/')
        expect(router.currentRoute.value.name, '沒有 meta 的頁面要放行').toBe('menu')
      }
    })
  })

  describe('5-4 checkStaffGuard', () => {
    // 另一種正確寫法：看 to.matched、先處理沒登入
    const correctB: Install = (router, auth) => {
      router.beforeEach(to => {
        const user = auth.user
        const needsLogin = to.matched.some(r => r.meta.requiresAuth)
        if (!user) return needsLogin ? { name: 'login', query: { redirect: to.fullPath } } : true
        const roles = to.meta.roles
        if (roles !== undefined && !roles.includes(user.role)) return { name: 'forbidden' }
        if (to.meta.ownStore === true && (user.storeId === undefined || String(user.storeId) !== to.params.storeId)) return { name: 'forbidden' }
        return true
      })
    }
    function wrong(kind: 'noRedirect' | 'loginOnly' | 'noStore' | 'baristaOnly'): Install {
      return (router, auth) => {
        router.beforeEach(to => {
          const user = auth.user
          if (to.meta.requiresAuth && !user) return kind === 'noRedirect' ? { name: 'login' } : { name: 'login', query: { redirect: to.fullPath } }
          if (!user || kind === 'loginOnly') return
          const roles = kind === 'baristaOnly' ? ['barista'] : to.meta.roles
          if (to.meta.roles && !roles!.includes(user.role)) return { name: 'forbidden' }
          if (kind !== 'noStore' && to.meta.ownStore && !(typeof user.storeId === 'number' && user.storeId === Number(to.params.storeId))) return { name: 'forbidden' }
        })
      }
    }
    // 正確版本 A：跟規格一樣的寫法
    const A: Install = (router, auth) => {
      router.beforeEach(to => {
        const user = auth.user
        if (to.meta.requiresAuth && !user) return { name: 'login', query: { redirect: to.fullPath } }
        if (!user) return
        if (to.meta.roles && !to.meta.roles.includes(user.role)) return { name: 'forbidden' }
        if (to.meta.ownStore && !(typeof user.storeId === 'number' && user.storeId === Number(to.params.storeId))) return { name: 'forbidden' }
      })
    }

    async function run(install: Install) {
      try {
        await checkStaffGuard(install)
        return null
      } catch (e) {
        return e instanceof Error ? e.message.split('\n')[0] : String(e)
      }
    }

    test.each([['A', A], ['B（寫法不同）', correctB]] as [string, Install][])('正確版本 %s 要通過', async (_name, install) => {
      const error = await run(install)
      expect(error, `你的檢查在正確版本上丟錯：${error}`).toBeNull()
    })

    test.each([
      ['導向登入頁時沒帶 redirect', wrong('noRedirect')],
      ['只檢查有沒有登入', wrong('loginOnly')],
      ['沒檢查門市', wrong('noStore')],
      ['只讓 barista 進（店長被擋）', wrong('baristaOnly')],
    ] as [string, Install][])('錯誤版本「%s」要被抓到', async (name, install) => {
      const error = await run(install)
      expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
    })
  })
})
