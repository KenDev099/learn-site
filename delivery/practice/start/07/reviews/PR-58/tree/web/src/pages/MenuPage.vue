<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listProducts, type Product } from '../api/products.ts'
import { useCartStore } from '../stores/cart.ts'

const cart = useCartStore()
const products = ref<Product[]>([])
const error = ref('')

onMounted(async () => {
  try {
    products.value = await listProducts()
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <h1>菜單</h1>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="!products.length">目前沒有商品。</p>
  <ul>
    <li v-for="p in products" :key="p.id">
      {{ p.name }} {{ p.price }} 元
      <button type="button" @click="cart.add(p)">加入</button>
    </li>
  </ul>
</template>
