import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { deferred } from '../../helpers/deferred.ts'
import CheckoutPage from './CheckoutPage.vue'

const Menu = defineComponent({ name: 'Menu', render: () => h('p', '菜單') })

type Submit = (form: { name: string; note: string }) => Promise<void>

async function setup({ answer = false, submit = vi.fn<Submit>(async () => {}) } = {}) {
  const confirm = vi.fn((_message: string) => answer)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'menu', component: Menu },
      // props 是物件時原樣傳給元件：用這個方式注入 submit 與 confirm
      { path: '/checkout', name: 'checkout', component: CheckoutPage, props: { submit, confirm } },
    ],
  })
  await router.push('/checkout')
  await router.isReady()
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return { router, wrapper, confirm, submit }
}

describe('練習 4：表單沒送出前離開要確認', () => {
  test('什麼都沒改就離開：不詢問', async () => {
    const { router, confirm } = await setup()
    await router.push('/')
    expect(confirm, '表單沒改過，不需要詢問').not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('menu')
  })

  test('改過再離開：詢問；回答取消就留在原頁，資料還在', async () => {
    const { router, wrapper, confirm } = await setup({ answer: false })
    await wrapper.get('[name="name"]').setValue('王小明')
    await router.push('/')
    expect(confirm, '表單 dirty 時離開要呼叫注入的 confirm()（用 onBeforeRouteLeave）').toHaveBeenCalledTimes(1)
    expect(typeof confirm.mock.calls[0][0], 'confirm 要傳入提示文字').toBe('string')
    expect(router.currentRoute.value.name, 'confirm 回傳 false 時要 return false 取消導航，留在結帳頁').toBe('checkout')
    expect((wrapper.get('[name="name"]').element as HTMLInputElement).value, '取消離開後，填的資料要還在').toBe('王小明')
  })

  test('只改備註再離開：也要詢問，回答確定就離開', async () => {
    const { router, wrapper, confirm } = await setup({ answer: true })
    await wrapper.get('[name="note"]').setValue('少冰')
    await router.push('/')
    expect(confirm, '只改備註也算 dirty：取餐人和備註兩個欄位都要跟存下的內容比').toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name, 'confirm 回傳 true 時要放行').toBe('menu')
  })

  test('改了又改回原樣：不算 dirty', async () => {
    const { router, wrapper, confirm } = await setup()
    await wrapper.get('[name="name"]').setValue('王小明')
    await wrapper.get('[name="name"]').setValue('')
    await router.push('/')
    expect(confirm, 'dirty 是「跟最後一次存下的內容比，有沒有不同」，改回原樣就不用問；用 computed 比較，不要用「打過字」的旗標').not.toHaveBeenCalled()
  })

  test('送出成功後離開：不再詢問', async () => {
    const { router, wrapper, confirm, submit } = await setup()
    await wrapper.get('[name="name"]').setValue('王小明')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith({ name: '王小明', note: '' })
    await router.push('/')
    expect(confirm, '送出成功後資料已經存了：要把「最後一次存下的內容」更新成剛送出的值，離開時就不再詢問').not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('menu')
  })

  test('送出途中又改了內容：離開仍要詢問', async () => {
    const pending = deferred<void>()
    const submit = vi.fn<Submit>(() => pending.promise)
    const { router, wrapper, confirm } = await setup({ submit })
    await wrapper.get('[name="name"]').setValue('王小明')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[name="note"]').setValue('少冰')   // 伺服器還沒回應時又改了備註
    pending.resolve()
    await flushPromises()
    await router.push('/')
    expect(confirm, '存下的是「送出的那一份」：在 await 之前先把 { name, note } 存成變數，成功後把它記成存下的內容；不要在 await 之後才讀 name.value、note.value，那會把還沒送出的備註也當成存好了').toHaveBeenCalledTimes(1)
  })

  test('送出失敗後離開：仍然詢問', async () => {
    const submit = vi.fn<Submit>(async () => { throw new Error('網路錯誤') })
    const { router, wrapper, confirm } = await setup({ submit })
    await wrapper.get('[name="name"]').setValue('王小明')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await router.push('/')
    expect(confirm, '送出失敗表示資料沒存：只能在 await submit() 成功之後才更新存下的內容').toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('checkout')
  })
})
