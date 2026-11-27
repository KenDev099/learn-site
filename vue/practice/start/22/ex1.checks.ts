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
  判分：你的函式會被套在 2 個內部寫法不同的正確版本（都要正常結束）和 7 個錯誤版本（每個都要丟錯）上。
*/
import { expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'

export async function checkCheckoutButton(Component: Component) {
  const submit = vi.fn(async () => {})
  const wrapper = mount(Component, { props: { submit } })
  expect(wrapper.exists()).toBe(true)
  // 在這裡寫：每個情境自己 mount，操作按鈕、讓 submit 成功或失敗，檢查畫面
}
