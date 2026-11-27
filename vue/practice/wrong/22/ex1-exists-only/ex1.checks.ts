/*
  練習 1：替「送出訂單」按鈕寫檢查
  問題：起始版只檢查 wrapper.exists()，元件壞成什麼樣子都會通過，等於沒有測試。
  要求：完成 checkCheckoutButton(Component)：掛載傳進來的元件，像使用者一樣操作它，
        元件不符合 CheckoutButton.vue 開頭的規格時丟出錯誤（expect 沒過就會丟錯），符合時正常結束。
  - 檢查：送出中按鈕停用、連點只呼叫一次 submit、成功後顯示「已送出」、
          失敗時顯示 role="alert" 而且沒有「已送出」、失敗後按鈕可以再按並再呼叫一次 submit
  - submit 用 vi.fn() 建立，回傳 deferred() 的 promise，由你決定什麼時候成功或失敗
  - 每個情境自己 mount 一次，不要共用 wrapper
  - 只能用規格寫到的東西找元素：<button>、文字、role。不要讀 wrapper.vm，不要用 class 名稱
  判分：你的函式會被套在 2 個內部寫法不同的正確版本（都要正常結束）和 5 個錯誤版本（每個都要丟錯）上。
*/
import { expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { deferred, type Deferred } from '../../helpers/deferred.ts'

function setup(Component: Component) {
  const pending: Deferred<void>[] = []
  const submit = vi.fn(() => {
    const d = deferred()
    pending.push(d)
    return d.promise
  })
  const wrapper = mount(Component, { props: { submit } })
  // 每次重新找：元件重新渲染後，舊的 wrapper 可能指向已經被換掉的元素
  const button = () => wrapper.get('button')
  return { wrapper, submit, pending, button }
}

export async function checkCheckoutButton(Component: Component) {
  expect(setup(Component).wrapper.exists()).toBe(true)
  return

  // 情境 1：連點、送出中、成功
  {
    const { wrapper, submit, pending, button } = setup(Component)
    await button().trigger('click')
    await button().trigger('click')
    expect(submit, '連點兩下只能呼叫一次 submit').toHaveBeenCalledTimes(1)
    expect(button().element.disabled, '送出中按鈕要停用').toBe(true)
    expect(wrapper.text(), '還沒成功就顯示「已送出」').not.toContain('已送出')

    pending[0]!.resolve()
    await flushPromises()
    expect(wrapper.text(), '成功後要顯示「已送出」').toContain('已送出')
  }

  // 情境 2：失敗、再按一次、成功
  {
    const { wrapper, submit, pending, button } = setup(Component)
    await button().trigger('click')
    pending[0]!.reject(new Error('網路斷線'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists(), '失敗要顯示 role="alert" 的錯誤訊息').toBe(true)
    expect(wrapper.text(), '失敗時不能顯示「已送出」').not.toContain('已送出')
    expect(button().element.disabled, '失敗後按鈕要恢復可以按').toBe(false)

    await button().trigger('click')
    expect(submit, '失敗後再按要再呼叫一次 submit').toHaveBeenCalledTimes(2)
    pending[1]!.resolve()
    await flushPromises()
    expect(wrapper.text(), '重新送出成功後要顯示「已送出」').toContain('已送出')
  }
}
