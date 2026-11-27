import { describe, expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, type WritableComputedRef } from 'vue'
import { useQueryFilter } from './useQueryFilter.ts'

let current: WritableComputedRef<'coffee' | 'tea' | 'food'> | undefined
const Menu = defineComponent({
  setup() {
    current = useQueryFilter('category', { allowed: ['coffee', 'tea', 'food'], fallback: 'coffee' })
    return { category: current }
  },
  template: '<p>分類：{{ category }}</p>',
})

async function setup(start: string) {
  current = undefined
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p>首頁</p>' } },
      { path: '/menu', component: Menu },
      { path: '/drinks', component: Menu },
      { path: '/menu/:id', component: { template: '<p>商品</p>' } },
    ],
  })
  await router.push(start)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}
const filter = () => {
  if (!current) throw new Error('（測試前提）菜單頁沒有掛載')
  return current
}
/** 按上一頁並等導航完成 */
async function back(router: Router) {
  const done = new Promise<void>(resolve => { const off = router.afterEach(() => { off(); resolve() }) })
  router.back()
  await done
  await flushPromises()
}

describe('練習 3：useQueryFilter', () => {
  test('從網址讀取，不合法就用預設值', async () => {
    const { router, wrapper } = await setup('/menu?category=tea')
    expect(filter().value, '?category=tea 要讀到 tea').toBe('tea')
    expect(wrapper.text()).toContain('分類：tea')
    await router.push('/menu?category=food')
    await flushPromises()
    expect(filter().value, '網址的 query 改變時要跟著變：值只能從 route.query 計算，不要存在本地的 ref').toBe('food')
    await router.push('/menu?category=%3Cscript%3E')
    await flushPromises()
    expect(filter().value, '?category=<script> 不在 allowed 裡，要回傳 fallback：query 是使用者可以亂改的輸入').toBe('coffee')
    await router.push('/menu')
    await flushPromises()
    expect(filter().value, '沒有 category 時回傳 fallback').toBe('coffee')
    await router.push('/menu?category=tea&category=food')
    await flushPromises()
    expect(filter().value, '同一個鍵出現兩次時 route.query.category 是陣列，也要回傳 fallback').toBe('coffee')
  })

  test('寫入時更新網址，保留其他 query', async () => {
    const { router } = await setup('/menu?page=2')
    filter().value = 'tea'
    await flushPromises()
    const route = router.currentRoute.value
    expect(route.path, '寫入後還在 /menu').toBe('/menu')
    expect(route.query.category, '寫入後網址要有 category=tea').toBe('tea')
    expect(route.query.page, '其他 query（page=2）要保留：用 { ...route.query, [key]: value }').toBe('2')
    expect(filter().value).toBe('tea')
  })

  test('寫入時保留目前的路徑，不寫死', async () => {
    const { router } = await setup('/drinks?page=3')
    filter().value = 'food'
    await flushPromises()
    expect(router.currentRoute.value.fullPath, '同一個 composable 用在 /drinks 時，寫入後要留在 /drinks：只傳 query，不要寫死 path').toBe('/drinks?page=3&category=food')
  })

  test('切換篩選用 replace，不增加歷史紀錄', async () => {
    const { router } = await setup('/')
    await router.push('/menu')
    await flushPromises()
    filter().value = 'tea'
    await flushPromises()
    filter().value = 'food'
    await flushPromises()
    expect(router.currentRoute.value.query.category).toBe('food')
    await back(router)
    expect(router.currentRoute.value.path, '改兩次篩選之後按上一頁，要直接回到首頁：寫入時用 router.replace，不要用 push').toBe('/')
  })

  test('從商品頁按上一頁，篩選從網址還原', async () => {
    const { router, wrapper } = await setup('/menu')
    filter().value = 'tea'
    await flushPromises()
    await router.push('/menu/4')
    await flushPromises()
    expect(wrapper.text()).toContain('商品')
    await back(router)
    expect(router.currentRoute.value.fullPath, '上一頁回到的網址要帶著 category=tea').toBe('/menu?category=tea')
    expect(filter().value, '菜單頁重新掛載後要讀到 tea：狀態存在網址裡，就不會因為元件被卸載而消失').toBe('tea')
  })
})
