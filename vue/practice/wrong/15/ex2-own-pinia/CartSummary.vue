<!--
練習 2：CartSummary 購物車摘要
問題：頁首的購物車摘要顯示「共幾個、小計多少」，旁邊有「清空」按鈕。
      起始程式直接解構 store：一開始顯示正確，之後購物車變了，畫面卻停在舊的數字。
要求：
  1. count、subtotal 用 storeToRefs 取出，store 變動時畫面跟著更新
  2. clear 是 action，直接從 store 解構（storeToRefs 不會給你 action）
  3. 按「清空」呼叫 store 的 clear() 一次
  4. 用 useCartStore() 拿 app 裡那一個 pinia 的 store，不要在元件裡 createPinia()
  （這題用到練習 1 的 cart-store.ts，先完成練習 1）
-->
<script setup lang="ts">
import { createPinia, storeToRefs } from 'pinia'
import { useCartStore } from './cart-store.ts'

const cart = useCartStore(createPinia())
const { count, subtotal } = storeToRefs(cart)
const { clear } = cart
</script>

<template>
  <p>共 {{ count }} 個，小計 {{ subtotal }} 元</p>
  <button type="button" @click="clear()">清空</button>
</template>
