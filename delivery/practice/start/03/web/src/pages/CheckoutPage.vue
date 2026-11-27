<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { createOrder } from '../api/orders.ts'
import { useCartStore } from '../stores/cart.ts'

// 還沒有登入功能：先固定用 1 號顧客（王小明）
const CUSTOMER_ID = 1

const cart = useCartStore()
const router = useRouter()
const note = ref('')
const error = ref('')
const sending = ref(false)

async function submit() {
  error.value = ''
  sending.value = true
  try {
    const order = await createOrder({
      customerId: CUSTOMER_ID,
      items: cart.lines.map(l => ({ productId: l.product.id, quantity: l.quantity })),
      note: note.value || undefined,
    })
    cart.clear()
    await router.push(`/orders/${order.id}`)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <h1>購物車</h1>
  <p v-if="!cart.lines.length">購物車是空的。</p>
  <form v-else @submit.prevent="submit">
    <ul>
      <li v-for="l in cart.lines" :key="l.product.id">
        {{ l.product.name }} × {{ l.quantity }}
        <button type="button" @click="cart.remove(l.product.id)">移除</button>
      </li>
    </ul>
    <p>合計 {{ cart.total }} 元</p>
    <label>備註 <input v-model="note" maxlength="200"></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="submit" :disabled="sending">送出訂單</button>
  </form>
</template>
