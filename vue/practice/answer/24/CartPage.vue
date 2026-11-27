<!--
練習 2：購物車頁（和 cart.ts、create-app.ts 一起改）
要求：用 cart.ts 的 useCart() 取得這次渲染的購物車，不要直接 import 模組層級的 cart。
      畫面：標題「王小明 的購物車」，每個品項一個 <li>。
-->
<script setup lang="ts">
import { useCart } from './cart.ts'

const cart = useCart()
</script>

<template>
  <h1>{{ cart.owner }} 的購物車</h1>
  <ul>
    <li v-for="item in cart.items" :key="item">{{ item }}</li>
  </ul>
</template>
