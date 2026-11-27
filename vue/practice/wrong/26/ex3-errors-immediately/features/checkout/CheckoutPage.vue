<!--
  練習 3：結帳頁（features/checkout，第 16、18 課）
  問題：起始版能下單，但是
        1. 一打開頁面，欄位下面就是一排紅字
        2. 只把按鈕設成 disabled：它只擋得住「點這顆按鈕」，快捷鍵、程式呼叫 requestSubmit() 等其他途徑觸發的 submit 還是會再送一次
        3. 每次嘗試都產生新的冪等鍵：第一次其實成功、只是回應沒收到，重送就變成兩筆訂單
        4. 伺服器回 422（ValidationError）時只顯示「送出失敗」，客人不知道哪一格錯了
        5. 在 finally 裡清空購物車：送出失敗，購物車也空了，客人要重新點一次
  要求：
  - 欄位：手機 phone（09 開頭的 10 位數字）、取餐時間 pickupTime（HH:mm，00:00～23:59）；validate() 已經寫好
  - 欄位的錯誤在 blur 過該欄位或按過送出之後才顯示，放在同一個 .field 裡的 <p class="error">；
    有錯的 input 加 aria-invalid="true" 和指向錯誤訊息的 aria-describedby
  - 前端驗證沒過就不送出
  - 送出進行中，再觸發 submit 不能再呼叫 api.createOrder（在函式開頭擋，不能只靠 disabled）
  - 冪等鍵：第一次送出時用 props.newKey() 產生，失敗重送沿用同一個；成功之後才清掉
  - api.createOrder({ phone, pickupTime, lines }, 冪等鍵)，lines 是購物車的每一列（不含 key 欄位）
  - 丟出 ValidationError：fieldErrors 顯示在對應欄位；其他錯誤顯示在 <p class="form-error" role="alert">
  - 成功：呼叫購物車的 clear()，再導到 { name: "order-status", params: { id: 新訂單的 id } }
  - 失敗：購物車不變、留在結帳頁
  - 不要改 input 的 name、class 名稱，測試靠它們找元素
-->
<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { useShopApi, ValidationError } from '../../shared/api.ts'
import { useCartStore } from '../cart/index.ts'

const props = defineProps<{ newKey: () => string }>()

type Field = 'phone' | 'pickupTime'
const FIELDS: { name: Field; label: string }[] = [
  { name: 'phone', label: '手機' },
  { name: 'pickupTime', label: '取餐時間（HH:mm）' },
]

function validate(values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  if (!/^09\d{8}$/.test(values.phone)) errors.phone = '手機要是 09 開頭的 10 位數字'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.pickupTime)) errors.pickupTime = '取餐時間格式要是 HH:mm'
  return errors
}

const api = useShopApi()
const router = useRouter()
const cart = useCartStore()
const id = useId()

const values = reactive<Record<Field, string>>({ phone: '', pickupTime: '' })
const clientErrors = computed(() => validate(values))
const serverErrors = ref<Partial<Record<Field, string>>>({})
const touched = reactive<Partial<Record<Field, boolean>>>({})
const submitted = ref(false)
const submitting = ref(false)
const formError = ref('')
let idempotencyKey: string | null = null   // 同一次結帳的每次嘗試共用，成功之後才清掉

function shownError(field: Field) {
  return serverErrors.value[field] ?? clientErrors.value[field]
}

function onInput(field: Field) {
  delete serverErrors.value[field]   // 改過了，伺服器對舊值的意見就不適用
}

async function onSubmit() {
  if (submitting.value) return       // 進行中保護：任何途徑的第二次 submit 都擋掉
  submitted.value = true
  formError.value = ''
  if (Object.keys(clientErrors.value).length > 0) return

  submitting.value = true
  idempotencyKey ??= props.newKey()
  try {
    const lines = cart.lines.map(({ key: _key, ...line }) => line)
    const order = await api.createOrder({ ...values, lines }, idempotencyKey)
    idempotencyKey = null
    cart.clear()                     // 只有成功才清空購物車
    await router.push({ name: 'order-status', params: { id: order.id } })
  } catch (error) {
    if (error instanceof ValidationError) {
      serverErrors.value = {
        phone: error.fieldErrors.phone?.[0],
        pickupTime: error.fieldErrors.pickupTime?.[0],
      }
    } else {
      formError.value = '送出失敗，請稍後再試'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <div v-for="f in FIELDS" :key="f.name" class="field">
      <label :for="`${id}-${f.name}`">{{ f.label }}</label>
      <input
        :id="`${id}-${f.name}`"
        v-model="values[f.name]"
        :name="f.name"
        :aria-invalid="shownError(f.name) ? 'true' : undefined"
        :aria-describedby="shownError(f.name) ? `${id}-${f.name}-error` : undefined"
        @input="onInput(f.name)"
        @blur="touched[f.name] = true"
      >
      <p v-if="shownError(f.name)" :id="`${id}-${f.name}-error`" class="error">{{ shownError(f.name) }}</p>
    </div>
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
    <button type="submit" :disabled="submitting">{{ submitting ? '送出中…' : '送出訂單' }}</button>
  </form>
</template>
