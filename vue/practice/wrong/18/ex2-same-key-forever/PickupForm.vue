<!--
  練習 2：外帶訂單表單的錯誤顯示與送出
  問題：起始版能送出，但是
        1. 使用者一開始打字，欄位下面就出現紅字（還沒打完就被罵）
        2. 只把按鈕設成 disabled 防重複送出：程式觸發的 submit 事件（或其他送出途徑）在送出中還是會再送一次
        3. 每次嘗試都產生新的冪等鍵：第一次其實成功、只是回應沒收到時，重送會建立第二筆訂單
        4. 伺服器回 422（ValidationError）時，只顯示一句籠統的訊息，使用者不知道哪一格錯了
        5. 螢幕報讀器不知道哪一格有錯；送出失敗時焦點沒有移到出錯的欄位
  要求：
  - 欄位的錯誤在「離開過該欄位（blur）」或「按過送出」之後才顯示；沒碰過的欄位不顯示
  - 送出進行中，再觸發 submit 事件不能再呼叫 props.submit（在函式開頭擋，不只靠 disabled）
  - 冪等鍵：同一筆訂單失敗後重送，沿用同一個 key；送出成功後清空表單，下一筆訂單用 props.newKey() 換新的
  - submit 丟出 ValidationError 時，把 fieldErrors 顯示在對應欄位下面；其他錯誤顯示在 .form-error（表單層級）
  - 使用者修改了某個欄位，就清掉那個欄位的伺服器錯誤（伺服器評的是修改前的值）
  - 有錯誤的欄位：aria-invalid="true"，aria-describedby 指向顯示錯誤訊息的元素；沒錯誤時兩個屬性都不要出現
  - 送出失敗（前端驗證沒過或 422）時，把焦點移到第一個有錯誤的欄位（依 FIELDS 的順序）
  - 不要改 pickup-schema.ts、errors.ts，也不要改欄位的 name 屬性與 class 名稱，測試靠它們找元素
-->
<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, useTemplateRef } from 'vue'
import { ValidationError } from './errors.ts'
import { FIELDS, validatePickup, type Field, type FieldErrors, type PickupValues } from './pickup-schema.ts'

const props = defineProps<{
  /** 送出訂單；伺服器回 422 時丟 ValidationError，其他失敗丟一般的 Error */
  submit: (values: PickupValues, idempotencyKey: string) => Promise<void>
  /** 產生新的冪等鍵（正式環境用 crypto.randomUUID()，測試會傳入可預測的版本） */
  newKey: () => string
}>()

const LABELS: Record<Field, string> = { name: '姓名', phone: '手機', pickupTime: '取餐時間（HH:mm）', note: '備註' }
const id = useId()
const formEl = useTemplateRef<HTMLFormElement>('form')

const empty = (): PickupValues => ({ name: '', phone: '', pickupTime: '', note: '' })
const values = reactive(empty())
const touched = reactive<Partial<Record<Field, boolean>>>({})
const submitted = ref(false)                 // 按過送出：所有欄位的錯誤都顯示
const serverErrors = ref<FieldErrors>({})    // 伺服器 422 回來的欄位錯誤
const clientErrors = computed(() => validatePickup(values))
const submitting = ref(false)
const formError = ref('')
const done = ref(false)
let idempotencyKey: string | null = null     // 同一筆訂單的每次嘗試共用；成功後才清掉

// 這個欄位現在要顯示的錯誤（沒有就是 undefined）
function shownError(field: Field): string | undefined {
  const server = serverErrors.value[field]?.[0]
  if (server) return server
  return touched[field] || submitted.value ? clientErrors.value[field]?.[0] : undefined
}

function onInput(field: Field) {
  delete serverErrors.value[field]           // 使用者改了，伺服器對舊值的意見就不適用了
}

async function focusFirstError() {
  await nextTick()                           // 等 aria-invalid 更新到 DOM
  formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}

async function onSubmit() {
  if (submitting.value) return               // 進行中保護：任何途徑觸發的第二次送出都擋掉
  submitted.value = true
  formError.value = ''
  done.value = false
  if (Object.keys(clientErrors.value).length > 0) return focusFirstError()

  submitting.value = true
  idempotencyKey ??= props.newKey()
  try {
    await props.submit({ ...values }, idempotencyKey)
    Object.assign(values, empty())
    for (const field of FIELDS) delete touched[field]
    submitted.value = false
    serverErrors.value = {}
    done.value = true
  } catch (error) {
    if (error instanceof ValidationError) {
      serverErrors.value = error.fieldErrors
      await focusFirstError()
    } else {
      formError.value = '送出失敗，請稍後再試'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form ref="form" novalidate @submit.prevent="onSubmit">
    <div v-for="field in FIELDS" :key="field" class="field">
      <label :for="`${id}-${field}`">{{ LABELS[field] }}</label>
      <input
        :id="`${id}-${field}`"
        v-model="values[field]"
        :name="field"
        :aria-invalid="shownError(field) ? 'true' : undefined"
        :aria-describedby="shownError(field) ? `${id}-${field}-error` : undefined"
        @input="onInput(field)"
        @blur="touched[field] = true"
      >
      <p v-if="shownError(field)" :id="`${id}-${field}-error`" class="error">{{ shownError(field) }}</p>
    </div>
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
    <p v-if="done" class="done" role="status">已收到訂單</p>
    <button type="submit" :disabled="submitting">{{ submitting ? '送出中…' : '送出訂單' }}</button>
  </form>
</template>
