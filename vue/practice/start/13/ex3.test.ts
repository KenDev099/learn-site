import { describe, expect, test } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createApp, defineComponent, h } from 'vue'
import { createApiPlugin, useApi } from './api-plugin.ts'
import MenuCount from './MenuCount.vue'
import { createFakeMenuApi, PRODUCTS } from '../../helpers/fake-api.ts'

describe('練習 3：createApiPlugin／useApi 與 MenuCount', () => {
  test('用 global.plugins 換成假的 client，MenuCount 顯示假資料的數量', async () => {
    for (const n of [2, 4]) {
      const api = createFakeMenuApi({ manual: true })
      const wrapper = mount(MenuCount, { global: { plugins: [createApiPlugin(api)] } })
      expect(wrapper.text(), '請求還沒完成時顯示「載入中…」').toBe('載入中…')
      expect(api.callsOf('getMenu').length, 'MenuCount 要透過 useApi() 呼叫 getMenu() 一次，不能直接 import realClient').toBe(1)
      api.calls[0]!.resolve(structuredClone(PRODUCTS.slice(0, n)))
      await flushPromises()
      expect(wrapper.text(), `假的 client 回傳 ${n} 個品項時要顯示「菜單共 ${n} 個品項」，不要寫死數字`).toBe(`菜單共 ${n} 個品項`)
      wrapper.unmount()
    }
  })

  test('請求失敗時顯示「菜單載入失敗」', async () => {
    const api = createFakeMenuApi({ manual: true })
    const wrapper = mount(MenuCount, { global: { plugins: [createApiPlugin(api)] } })
    api.calls[0]!.reject(new Error('500'))
    await flushPromises()
    expect(wrapper.text(), 'getMenu() reject 時要顯示「菜單載入失敗」').toBe('菜單載入失敗')
  })

  test('外掛在安裝時用 app.provide 提供 client，每個 app 各自一份', () => {
    const a = createFakeMenuApi(), b = createFakeMenuApi()
    const appA = createApp({}).use(createApiPlugin(a))
    const appB = createApp({}).use(createApiPlugin(b))
    expect(appA.runWithContext(() => useApi()), 'app.use(createApiPlugin(a)) 之後，這個 app 裡的 useApi() 要拿到 a：在 install(app) 裡呼叫 app.provide').toBe(a)
    expect(appB.runWithContext(() => useApi()), '另一個 app 要拿到自己的 b：不要把 client 存在模組層級的變數，否則兩個 app 會互相蓋掉').toBe(b)
    expect(appA.runWithContext(() => useApi()), '安裝 b 之後，appA 拿到的還是 a').toBe(a)
  })

  test('沒有安裝外掛時，useApi() 丟出說明怎麼修的錯誤', () => {
    const warnings: string[] = []
    const Lonely = defineComponent({ setup() { useApi(); return () => h('div') } })
    expect(() => mount(Lonely, { global: { config: { warnHandler: m => { warnings.push(m) } } } }),
      '沒有提供 client 時 useApi() 要 throw，訊息提到 createApiPlugin，告訴人要先安裝外掛').toThrow(/createApiPlugin/)
    expect(warnings.filter(w => w.includes('not found')), 'inject 給預設值 null，就不會先出現 injection not found 警告').toEqual([])
  })
})
