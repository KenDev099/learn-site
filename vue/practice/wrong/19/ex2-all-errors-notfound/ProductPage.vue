<script setup lang="ts">
// 練習 2：商品頁在參數改變時重新載入
// 問題：從 /menu/1 點「下一個商品」到 /menu/2，畫面還是美式咖啡。
//       Vue Router 重用了同一個 ProductPage，onMounted 不會再執行，所以沒有重新抓資料。
// 要求：
//   1. 只透過 props 拿 id（路由用 props 函式傳進來），不要用 useRoute()：這樣不接 router 也能單獨測試
//   2. 一開始就載入一次，之後 id 每次改變都重新載入（api.getProduct(id, { signal })）
//   3. 載入中顯示「載入中…」；成功顯示 <h1>商品名稱</h1> 和「NT$ 價格」；
//      找不到（錯誤的 status 是 404）顯示「找不到這個商品」；其他錯誤顯示「載入失敗」
//   4. 過期的回應不能蓋掉新的：從 1 換到 2 時，1 的請求就算比較晚回來也不能顯示（建議取消舊請求）
import { onWatcherCleanup, ref, watch } from 'vue'
import type { Product } from '../../helpers/fake-api.ts'
import { useMenuApi } from './menu-api.ts'

const props = defineProps<{ id: number }>()
const api = useMenuApi()
const product = ref<Product | null>(null)
const status = ref<'loading' | 'success' | 'not-found' | 'error'>('loading')

watch(() => props.id, (id) => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())   // id 又變了或元件卸載：取消舊請求，它的結果不會再寫進畫面
  status.value = 'loading'
  api.getProduct(id, { signal: controller.signal }).then(
    p => { product.value = p; status.value = 'success' },
    e => {
      if (controller.signal.aborted) return
      status.value = 'not-found'
    },
  )
}, { immediate: true })
</script>

<template>
  <p v-if="status === 'loading'">載入中…</p>
  <p v-else-if="status === 'not-found'">找不到這個商品</p>
  <p v-else-if="status === 'error'">載入失敗</p>
  <article v-else-if="product">
    <h1>{{ product.name }}</h1>
    <p>NT$ {{ product.price }}</p>
  </article>
</template>
