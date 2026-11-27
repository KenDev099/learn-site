<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { OrderResponse } from '../../../shared/contract.ts'
import { getOrder } from '../api/orders.ts'

const props = defineProps<{ id: number }>()
const order = ref<OrderResponse | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    order.value = await getOrder(props.id)
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <h1>訂單 #{{ id }}</h1>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-else-if="order">
    <p>狀態：{{ order.status }}</p>
    <p>合計 {{ order.total }} 元</p>
  </template>
</template>
