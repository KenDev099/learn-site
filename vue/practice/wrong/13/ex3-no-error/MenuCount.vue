<script setup lang="ts">
// 練習 3：用外掛注入 API client
// 問題：MenuCount 直接 import 真正的 realClient。元件和「怎麼連 API」綁死了：測試沒辦法換成假的，
//       realClient 在測試環境一被呼叫就丟錯。
// 要求：
//   1. api-plugin.ts 的 createApiPlugin(client) 回傳一個外掛（plugin）：app.use() 安裝時用 app.provide(API_KEY, client)
//   2. useApi() 用 inject 取出 client；沒有安裝外掛時丟出 Error，訊息要提到 createApiPlugin
//   3. 不要把 client 存在模組層級的變數：同一個程式裡的兩個 app（例如伺服器同時處理兩個請求）要各自拿到自己的 client
//   4. MenuCount.vue 用 useApi().getMenu() 取得菜單，載入中顯示「載入中…」，完成後顯示「菜單共 N 個品項」，
//      失敗時顯示「菜單載入失敗」；不能 import real-client.ts
import { ref } from 'vue'
import { useApi } from './api-plugin.ts'

const api = useApi()   // 在 setup 同步呼叫：inject 只能在這裡用
const count = ref<number | null>(null)
const failed = ref(false)
api.getMenu().then(list => { count.value = list.length })   // 沒處理失敗
</script>

<template>
  <p v-if="failed">菜單載入失敗</p>
  <p v-else-if="count === null">載入中…</p>
  <p v-else>菜單共 {{ count }} 個品項</p>
</template>
