import { describe, expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProductDetail from './ProductDetail.vue'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'

function setup() {
  const api = createFakeMenuApi({ manual: true })
  const wrapper = mount(ProductDetail, { props: { productId: 2, api } })
  const calls = () => api.callsOf('getProduct')
  return { api, wrapper, calls }
}

describe('練習 3：ProductDetail 在 productId 改變時重新載入', () => {
  test('掛載時立刻載入目前的商品', async () => {
    const { wrapper, calls } = setup()
    expect(calls().map(c => c.args), '掛載時要立刻呼叫 api.getProduct(2)：watch 要加 { immediate: true }').toEqual([[2]])
    calls()[0].resolve()
    await flushPromises()
    expect(wrapper.find('.name').text(), '載入完要顯示「拿鐵 $110」').toBe('拿鐵 $110')
  })

  test('productId 改變時重新載入', async () => {
    const { wrapper, calls } = setup()
    calls()[0].resolve()
    await flushPromises()
    await wrapper.setProps({ productId: 5 })
    expect(calls().map(c => c.args), 'productId 從 2 換成 5，要再呼叫 api.getProduct(5)：用 watch(() => productId, …) 監聽，只在 onMounted 載入一次不夠').toEqual([[2], [5]])
    calls()[1].resolve()
    await flushPromises()
    expect(wrapper.find('.name').text(), '換商品後要顯示「可頌 $70」').toBe('可頌 $70')
  })

  test('舊的請求比較晚回來，也不能蓋掉新的商品', async () => {
    const { wrapper, calls } = setup()
    await wrapper.setProps({ productId: 5 })
    expect(calls().length, 'productId 改變時要重新呼叫 api.getProduct').toBe(2)
    calls()[1].resolve()
    await flushPromises()
    calls()[0].resolve()
    await flushPromises()
    expect(wrapper.find('.name').text(), '拿鐵（舊請求）比可頌晚回來，畫面卻變回拿鐵：用 onWatcherCleanup 取消上一個請求（傳 signal 給 api.getProduct），或丟掉過期的結果').toBe('可頌 $70')
  })
})
