// 練習 1：app 層的組裝（要改）
// 問題：MenuList 自己呼叫 fetch，測試和正式環境都沒辦法換掉資料來源。
// 要求：
//   1. createRootApp(api) 要用 app.provide(MENU_API, api) 把 API client 提供給整個 app
//      （正式環境的入口會寫 createRootApp(createHttpMenuApi(config.apiBaseUrl)).mount('#app')）
//   2. 這裡是唯一決定「用哪一個 API client」的地方，元件只透過 useMenuApi() 拿
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import type { MenuApi } from '../shared/api/menu-api.ts'

export function createRootApp(api: MenuApi) {
  const app = createApp(App)
  app.use(createPinia())
  // TODO：把 api 提供給整個 app
  return app
}
