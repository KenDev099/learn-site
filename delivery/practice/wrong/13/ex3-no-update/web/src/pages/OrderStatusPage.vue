<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue'
import type { OrderResponse } from '../../../shared/contract.ts'
import { ApiError } from '../api/client.ts'
import { cancelOrder, getOrder } from '../api/orders.ts'
import PickupTime from '../components/PickupTime.vue'

const props = defineProps<{ id: number }>()
const order = ref<OrderResponse | null>(null)
const error = ref('')
const needLogin = ref(false)   // v2.8.0：看訂單要先登入
const confirmDialog = useTemplateRef<HTMLDialogElement>('confirm')   // CAFE-50：取消前的確認視窗
const cancelError = ref('')
const cancelling = ref(false)

onMounted(async () => {
  try {
    order.value = await getOrder(props.id)
  } catch (e) {
    needLogin.value = e instanceof ApiError && e.status === 401
    error.value = (e as Error).message
  }
})

async function cancel() {
  confirmDialog.value?.close()
  cancelling.value = true
  cancelError.value = ''
  try {
    await cancelOrder(props.id)
  } catch (e) {
    cancelError.value = (e as Error).message
    // 409：狀態在你看這一頁的時候變了（例如吧台開始製作）。重新讀一次，按鈕跟著狀態消失
    if (e instanceof ApiError && e.status === 409) order.value = await getOrder(props.id).catch(() => order.value)
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <h1>訂單 #{{ id }}</h1>
  <p v-if="needLogin" role="alert">請先<RouterLink :to="`/login?back=/orders/${id}`">登入</RouterLink>再查看訂單</p>
  <p v-else-if="error" role="alert">{{ error }}</p>
  <template v-else-if="order">
    <p>狀態：{{ order.status }}</p>
    <p>合計 {{ order.total }} 元</p>
    <p v-if="order.pickupAt">取餐時間：<PickupTime :at="order.pickupAt" /></p>
    <p v-else>現點現做</p>
    <p v-if="order.status === 'cancelled'" role="status">已取消，款項將退回</p>
    <p v-if="cancelError" role="alert">{{ cancelError }}</p>
    <!-- 只有付好款、還沒開始製作的訂單可以取消（docs/meeting-notes-13.md） -->
    <button v-if="order.status === 'paid'" type="button" :disabled="cancelling" @click="confirmDialog?.showModal()">取消訂單</button>
    <!-- 原生 <dialog>：showModal() 會把焦點移進視窗、背景不能操作、Esc 關閉 -->
    <dialog ref="confirm" aria-labelledby="cancel-title">
      <h2 id="cancel-title">確定要取消訂單嗎？</h2>
      <p>會全額退款 {{ order.total }} 元，這張訂單送的點數會扣回。</p>
      <button type="button" @click="cancel">確定取消</button>
      <button type="button" autofocus @click="confirmDialog?.close()">先不要</button>
    </dialog>
  </template>
</template>
