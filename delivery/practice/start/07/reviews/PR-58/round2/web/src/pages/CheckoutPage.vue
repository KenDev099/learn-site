<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CouponResponse } from '../../../shared/contract.ts'
import { ApiError } from '../api/client.ts'
import { getCpnInfo } from '../api/coupons.ts'
import { createOrder } from '../api/orders.ts'
import { listPickupSlots, type PickupSlot } from '../api/pickup.ts'
import { useCartStore } from '../stores/cart.ts'
import CouponBanner from '../components/CouponBanner.vue'

// 還沒有登入功能：先固定用 1 號顧客（王小明）
const CUSTOMER_ID = 1

const cart = useCartStore()
const router = useRouter()
const route = useRoute()
const customerNote = ref('')
const pickupAt = ref('')   // ''＝現點現做；選了時段就是那個時段的 start
const slots = ref<PickupSlot[]>([])
const error = ref('')
const sending = ref(false)

// CAFE-29 優惠券。畫面上的折扣只是預覽，實際金額由 API 計算。行銷的分享連結會帶 ?coupon=OPEN10，進到結帳頁就自動套用
const couponCode = ref(typeof route.query.coupon === 'string' ? route.query.coupon : '')
const coupon = ref<CouponResponse | null>(null)
const couponMessage = ref('')
const discount = computed(() => coupon.value ? Math.floor(cart.total * coupon.value.percentOff / 100) : 0)

async function applyCoupon() {
  coupon.value = null
  couponMessage.value = ''
  if (!couponCode.value) return
  try {
    coupon.value = await getCpnInfo(couponCode.value)
    couponMessage.value = coupon.value.description
  } catch (e) {
    couponMessage.value = (e as Error).message
  }
}

async function loadSlots() {
  try {
    slots.value = await listPickupSlots()
  } catch {
    slots.value = []   // 載不到時段時還是可以現點現做
  }
}
onMounted(() => {
  void loadSlots()
  void applyCoupon()
})

async function submit() {
  error.value = ''
  sending.value = true
  try {
    const order = await createOrder({
      customerId: CUSTOMER_ID,
      items: cart.lines.map(l => ({ productId: l.product.id, quantity: l.quantity })),
      customerNote: customerNote.value || undefined,
      pickupAt: pickupAt.value || undefined,
      couponCode: coupon.value?.code,
    })
    cart.clear()
    await router.push(`/orders/${order.id}`)
  } catch (e) {
    if (e instanceof ApiError && e.code === 'SLOT_FULL') {
      // 購物車不動，請顧客改選；重新載入，剛額滿的時段就會變成不能選
      error.value = '這個時段已額滿，請改選其他時段'
      pickupAt.value = ''
      await loadSlots()
    } else {
      error.value = (e as Error).message
    }
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
    <fieldset>
      <legend>優惠券</legend>
      <input v-model.trim="couponCode" placeholder="輸入優惠碼">
      <button type="button" @click="applyCoupon">套用</button>
      <CouponBanner v-if="couponMessage" :message="couponMessage" />
    </fieldset>
    <p>合計 {{ cart.total }} 元<template v-if="discount">，折扣 {{ discount }} 元，應付 {{ cart.total - discount }} 元</template></p>
    <fieldset>
      <legend>取餐時間</legend>
      <label><input v-model="pickupAt" type="radio" name="pickup" value=""> 現點現做</label>
      <label v-for="s in slots" :key="s.start">
        <input v-model="pickupAt" type="radio" name="pickup" :value="s.start" :disabled="s.remaining === 0">
        {{ s.label }}<template v-if="s.remaining === 0">（已滿）</template>
      </label>
    </fieldset>
    <label>顧客備註 <input v-model="customerNote" maxlength="200"></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="submit" :disabled="sending">送出訂單</button>
  </form>
</template>
