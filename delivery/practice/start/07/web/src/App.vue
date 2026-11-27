<script setup lang="ts">
import { useCartStore } from './stores/cart.ts'

const cart = useCartStore()
</script>

<template>
  <header>
    <RouterLink to="/">菜單</RouterLink> ·
    <RouterLink to="/checkout">購物車（{{ cart.count }}）</RouterLink>
  </header>
  <main>
    <RouterView />
  </main>
</template>
