/*
  練習 2：替菜單頁寫檢查
  問題：起始版只檢查一開始有「載入中」，載入成功、失敗、重試都沒有檢查。
  要求：完成 checkMenuPage(Component, makeApi)：元件不符合 MenuPage.vue 開頭的規格時丟錯，符合時正常結束。
  - 每個情境呼叫 makeApi() 拿一個新的假 API（手動模式），mount(Component, { props: { api } })
  - api.callsOf('getMenu') 是 getMenu 每次被呼叫的紀錄；紀錄的 resolve() 讓它成功（不給值就回傳 6 個預設品項），
    reject(new Error('…')) 讓它失敗
  - 讓 API 完成之後要 await flushPromises()，元件裡 await 之後的程式和畫面更新才會跑完；不要用 setTimeout 等
  - 檢查：載入中、成功時列出全部品項而且不再顯示載入中、失敗時有 role="alert" 和「重試」按鈕而且不再顯示載入中、
          按重試會再呼叫 getMenu 並回到載入中、重試成功後列出品項而且錯誤訊息消失
  - 「重試」按鈕用文字找：畫面上可能不只一個按鈕
  判分：2 個正確版本要正常結束，7 個錯誤版本都要丟錯；程式裡不能出現 setTimeout。
*/
import { expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Component } from 'vue'
import type { FakeMenuApi } from '../../helpers/fake-api.ts'

export async function checkMenuPage(Component: Component, makeApi: () => FakeMenuApi) {
  const api = makeApi()
  const wrapper = mount(Component, { props: { api } })
  expect(wrapper.text(), '等待中要顯示「載入中」').toContain('載入中')
  // 在這裡寫：讓 api.callsOf('getMenu')[0] 成功或失敗，等畫面更新，再檢查
}
