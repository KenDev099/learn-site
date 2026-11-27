<!--
練習 1：菜單列表（features/menu 的內部元件）
問題：
  1. 直接 import cart 的內部檔案 cart-store.ts（要改成 cart 的 index.ts）
  2. 直接呼叫 fetch（只有 shared/api 可以呼叫 fetch；這裡改用 useMenuApi() 拿注入的 client）
  3. 「未登入不能加入」的規則寫在 shared/ui 的 BaseButton 裡；改成在這裡判斷，用 :disabled 傳給 BaseButton
     （登入狀態從 auth 的 index.ts 拿）
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BaseButton from '../../shared/ui/BaseButton.vue'
import { useMenuApi, type Product } from '../../shared/api/menu-api.ts'
import { formatPrice } from '../../shared/lib/money.ts'
import { useCartStore } from '../cart/index.ts'
import { useSession } from '../auth/index.ts'

const api = useMenuApi()
const cart = useCartStore()
const session = useSession()
const products = ref<Product[]>([])
const error = ref('')

onMounted(async () => {
  try {
    products.value = await api.getMenu()
  } catch {
    error.value = '菜單載入失敗'
  }
})
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <ul>
    <li v-for="p in products" :key="p.id">
      {{ p.name }} {{ formatPrice(p.price) }}
      <BaseButton :disabled="!session.loggedIn" @click="cart.add(p)">加入</BaseButton>
    </li>
  </ul>
</template>
