<!--
練習 1：菜單頁（pages 層）
頁面負責組合 feature，本身不寫業務邏輯。頁面可以用 feature，但只能透過 feature 的 index.ts。
問題：這裡直接 import 了 cart 的內部檔案 CartBadge.vue。
-->
<script setup lang="ts">
import { MenuList } from '../features/menu/index.ts'
import CartBadge from '../features/cart/CartBadge.vue'
</script>

<template>
  <header><CartBadge /></header>
  <main><MenuList /></main>
</template>
