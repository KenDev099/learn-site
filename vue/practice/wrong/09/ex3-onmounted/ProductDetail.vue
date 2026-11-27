<!--
練習 3：商品詳情 ProductDetail（props 改變時重新載入）
問題：這個元件在 setup 裡把 props.productId 複製到變數 id，只在 onMounted 載入一次。
      父元件切換到別的商品（productId 改變）時，畫面還是第一個商品。
要求：
  1. 用解構的方式取得 props：const { productId, api } = defineProps<…>()
  2. 掛載時立刻呼叫 api.getProduct(productId, { signal })，之後 productId 每次改變都重新載入
     （watch 解構出來的 prop 要寫成 getter：() => productId）
  3. 在 .name 顯示「品名 $價格」，例如「拿鐵 $110」
  4. 切換太快時只顯示最新的商品：舊的請求比較晚回來，也不能蓋掉新的結果（第 5 課的清理函式）
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

const { productId, api } = defineProps<{ productId: number; api: FakeMenuApi }>()
const product = ref<Product | null>(null)

// 解構了，但只在掛載時載入一次
onMounted(async () => {
  product.value = await api.getProduct(productId)
})
</script>

<template>
  <section>
    <p v-if="product" class="name">{{ product.name }} ${{ product.price }}</p>
    <p v-else class="loading">載入中…</p>
  </section>
</template>
