<!--
  店員區的吧台看板（已經寫好，不用改）：只有店員會進來，所以它應該在自己的 chunk 裡，
  一般顧客打開菜單時不用下載它（練習 5-2）
-->
<script setup lang="ts">
import type { Order } from '../../shared/api.ts'
import { can, type User } from './can.ts'

defineProps<{ user: User; orders: Order[] }>()
const emit = defineEmits<{ markReady: [orderId: number] }>()
</script>

<template>
  <section class="staff-board">
    <h1>吧台訂單看板</h1>
    <ul>
      <li v-for="order in orders" :key="order.id">
        #{{ order.id }} {{ order.status }}
        <button v-if="can(user, 'order:ready', order) && order.status !== 'ready'" type="button" @click="emit('markReady', order.id)">可取餐</button>
      </li>
    </ul>
  </section>
</template>
