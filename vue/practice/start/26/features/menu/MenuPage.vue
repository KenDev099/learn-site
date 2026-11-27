<!--
  練習 1：菜單頁（features/menu）
  問題：起始版能動，但是
        1. 分類存在元件自己的 ref 裡：分享網址給朋友，對方看到的是預設分類；進商品頁再按上一頁，分類又跳回咖啡
        2. 每打一個字就查一次：打「拿鐵」送出兩個請求；比較早送出的請求比較晚回來時，舊結果蓋掉新結果
        3. 只有「載入中」和「列表」：API 失敗時畫面停在載入中；搜尋不到東西時一片空白
  要求：
  - 分類只來自網址的 query string：?category=coffee | tea | food；沒有、不合法、重複出現（陣列）都當成 coffee
    點分類按鈕時改網址（router.push 或 router.replace 都可以，保留其他 query），不要另外存一份本地狀態
  - 搜尋框停止輸入 300ms 後才查詢（去掉頭尾空白；空字串就顯示目前分類的菜單）
    有關鍵字時呼叫 api.search(關鍵字, { signal })，沒有時呼叫 api.getMenu(分類, { signal })
  - 只顯示最新一次請求的結果：條件改變時 abort 上一次的請求，過期的回應（成功或失敗）都不能改畫面
  - 三種狀態：載入中 <p role="status">；失敗 <p role="alert"> 加一個「重試」按鈕（再查一次同樣的條件）；
    沒有結果 <p class="empty">找不到符合的商品</p>；有結果才顯示 <li class="product">
  - API 一律從 useShopApi() 拿（shared/api.ts），不要在元件裡 fetch
  - 不要改按鈕的 data-category、搜尋框的 name="keyword"，測試靠它們找元素
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useShopApi, type Category, type Product } from '../../shared/api.ts'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'coffee', label: '咖啡' },
  { value: 'tea', label: '茶' },
  { value: 'food', label: '點心' },
]

const api = useShopApi()
const category = ref<Category>('coffee')
const keyword = ref('')
const products = ref<Product[]>([])
const loading = ref(true)

watch([category, keyword], async ([cat, kw]) => {
  loading.value = true
  products.value = kw ? await api.search(kw) : await api.getMenu(cat)
  loading.value = false
}, { immediate: true })
</script>

<template>
  <nav aria-label="分類">
    <button
      v-for="c in CATEGORIES"
      :key="c.value"
      type="button"
      :data-category="c.value"
      :aria-pressed="category === c.value"
      @click="category = c.value"
    >{{ c.label }}</button>
  </nav>
  <label>搜尋 <input v-model="keyword" type="search" name="keyword"></label>
  <p v-if="loading" role="status">載入中…</p>
  <ul v-else>
    <li v-for="p in products" :key="p.id" class="product">{{ p.name }} {{ p.price }} 元</li>
  </ul>
</template>
