<!--
  練習 2-3：頁首的購物車徽章 CartBadge（features/cart，第 15 課）
  問題：起始版直接解構 store，一開始顯示 0 件，之後加了商品，徽章還是 0。
  要求：
  - 顯示「購物車 N 件，共 M 元」，N 是 count、M 是 total，購物車變動時跟著更新
  - state 和 getter 用 storeToRefs 取出（或直接寫 cart.count），不要直接解構 store
  - 按「清空」呼叫 store 的 clear() 一次（action 可以直接從 store 解構）
-->
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCartStore } from './cart-store.ts'

const cart = useCartStore()
const { count, total } = storeToRefs(cart)   // 解構出來的是 ref，跟 store 保持連動
const { clear } = cart                       // action 不是響應式資料，可以直接解構
</script>

<template>
  <p class="cart-badge">購物車 {{ count }} 件，共 {{ total }} 元</p>
  <button type="button" @click="clear()">清空</button>
</template>
