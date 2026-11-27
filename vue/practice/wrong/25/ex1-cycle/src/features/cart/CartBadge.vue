<!--
練習 1：頁首的購物車徽章（cart 的內部元件）
問題：為了 formatPrice 去 import menu 的公開介面。formatPrice 跟購物車、菜單都無關，應該放在 shared/lib。
-->
<script setup lang="ts">
import { useCartStore } from './cart-store.ts'
import { formatPrice } from '../menu/index.ts'

const cart = useCartStore()
</script>

<template>
  <p>購物車 {{ cart.count }} 件 · {{ formatPrice(cart.subtotal) }}</p>
</template>
