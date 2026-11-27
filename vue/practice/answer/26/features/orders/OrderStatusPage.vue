<!--
  練習 4-2：訂單狀態頁（features/orders，第 17、21 課）
  路由：/orders/:id，props 是 { orderId: number }
  要求：
  - 用練習 4-1 的 useOrderPolling(orderId, useShopApi()) 取得訂單
  - 狀態顯示在 <p class="status">：received →「已收到訂單」、brewing →「製作中」、ready →「可以取餐了」
    還沒拿到訂單時顯示「載入中…」
  - error 有值時顯示 <p role="alert" class="poll-error">查詢訂單狀態失敗</p> 和一個「重試」按鈕（呼叫 retry）
  - 訂單明細 <OrderDetails :order="order" /> 用 shared/ui/ErrorBoundary.vue 包起來：
    明細渲染出錯時只有明細換成替代畫面，狀態和重試按鈕照常運作，錯誤也不會再傳到 app 的 errorHandler
-->
<script setup lang="ts">
import { useShopApi, type OrderStatus } from '../../shared/api.ts'
import ErrorBoundary from '../../shared/ui/ErrorBoundary.vue'
import OrderDetails from './OrderDetails.vue'
import { useOrderPolling } from './useOrderPolling.ts'

const props = defineProps<{ orderId: number }>()
const { order, error, retry } = useOrderPolling(props.orderId, useShopApi())

const LABELS: Record<OrderStatus, string> = { received: '已收到訂單', brewing: '製作中', ready: '可以取餐了' }
</script>

<template>
  <h1>訂單 #{{ orderId }}</h1>
  <p class="status">{{ order ? LABELS[order.status] : '載入中…' }}</p>
  <template v-if="error">
    <p role="alert" class="poll-error">查詢訂單狀態失敗</p>
    <button type="button" @click="retry">重試</button>
  </template>
  <ErrorBoundary v-if="order">
    <OrderDetails :order="order" />
  </ErrorBoundary>
</template>
