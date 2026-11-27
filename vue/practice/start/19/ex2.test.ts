import { describe, expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createFakeMenuApi, type FakeMenuApi } from '../../helpers/fake-api.ts'
import { MENU_API } from './menu-api.ts'
import ProductPage from './ProductPage.vue'

async function setup(api: FakeMenuApi, start = '/menu/1') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/menu/:id(\\d+)', component: ProductPage, props: r => ({ id: Number(r.params.id) }) },
    ],
  })
  await router.push(start)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, {
    global: { plugins: [router], provide: { [MENU_API as symbol]: api } },
  })
  await flushPromises()
  return { router, wrapper }
}
const ids = (api: FakeMenuApi) => api.callsOf('getProduct').map(c => c.args[0])

describe('練習 2：參數改變時重新載入', () => {
  test('第一次進入就載入', async () => {
    const api = createFakeMenuApi()
    const { wrapper } = await setup(api)
    expect(ids(api), '一進入 /menu/1 就要呼叫 api.getProduct(1)').toEqual([1])
    expect(wrapper.text(), '載入後顯示商品名稱').toContain('美式咖啡')
    expect(wrapper.text(), '載入後顯示價格').toContain('NT$ 80')
  })

  test('/menu/1 → /menu/2：同一個元件被重用，也要重新載入', async () => {
    const api = createFakeMenuApi()
    const { router, wrapper } = await setup(api)
    const first = wrapper.findComponent(ProductPage).vm.$.uid
    await router.push('/menu/2')
    await flushPromises()
    expect(wrapper.findComponent(ProductPage).vm.$.uid, '（測試前提）Vue Router 重用了同一個元件實例').toBe(first)
    expect(ids(api), 'id 改成 2 之後要再呼叫 api.getProduct(2)：onMounted 不會再執行，要用 watch 監看 props.id').toEqual([1, 2])
    expect(wrapper.text(), '換成拿鐵').toContain('拿鐵')
    await router.push('/menu/5')
    await flushPromises()
    expect(wrapper.text(), '再換一次也要更新').toContain('可頌')
  })

  test('載入中與找不到', async () => {
    const api = createFakeMenuApi({ manual: true })
    const { router, wrapper } = await setup(api)
    expect(wrapper.text(), '請求還沒回來時顯示「載入中…」').toContain('載入中…')
    api.calls[0]!.resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('美式咖啡')
    await router.push('/menu/99')
    await flushPromises()
    expect(wrapper.text(), '換 id 之後、新的請求回來之前，要回到「載入中…」，不要繼續顯示上一個商品').toContain('載入中…')
    api.calls[1]!.resolve()
    await flushPromises()
    expect(wrapper.text(), 'API 丟出 status 404 的錯誤時顯示「找不到這個商品」').toContain('找不到這個商品')
    await router.push('/menu/3')
    await flushPromises()
    api.calls[2]!.reject(new Error('伺服器錯誤'))
    await flushPromises()
    expect(wrapper.text(), '不是 404 的錯誤要顯示「載入失敗」，不要都當成找不到').toContain('載入失敗')
  })

  test('過期的回應不能蓋掉新的', async () => {
    const api = createFakeMenuApi({ manual: true })
    const { router, wrapper } = await setup(api)
    await router.push('/menu/2')
    await flushPromises()
    expect(ids(api)).toEqual([1, 2])
    expect(wrapper.text(), '舊請求被取消（AbortError）不是載入失敗：取消造成的錯誤要忽略，畫面維持「載入中…」').toContain('載入中…')
    api.calls[1]!.resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('拿鐵')
    api.calls[0]!.resolve()   // 商品 1 的請求比較晚才回來
    await flushPromises()
    expect(wrapper.text(), '商品 1 的回應比較晚回來，不能蓋掉拿鐵：在 watch 的 onCleanup 取消舊請求，或丟掉過期的結果').toContain('拿鐵')
    expect(wrapper.text()).not.toContain('美式咖啡')
  })

  test('只靠 props，不接 router 也能單獨掛載', async () => {
    const api = createFakeMenuApi()
    const wrapper = mount(ProductPage, { props: { id: 4 }, global: { provide: { [MENU_API as symbol]: api } } })
    await flushPromises()
    expect(wrapper.text(), 'ProductPage 只從 props 拿 id，不要用 useRoute()：這樣單獨測試、重用在別的頁面都不用接 router').toContain('伯爵紅茶')
    await wrapper.setProps({ id: 6 })
    await flushPromises()
    expect(wrapper.text(), 'props.id 改變就重新載入').toContain('起司蛋糕')
  })
})
