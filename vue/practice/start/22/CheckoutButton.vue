<!--
  練習 1 的受測元件（已經寫好，不用改）：結帳頁的「送出訂單」按鈕
  規格（你的檢查只能依賴這裡寫的東西，判分時會換成內部寫法、class、文字細節都不同的另一個正確版本）：
  - props：submit: () => Promise<void>
  - 畫面上只有一個 <button>；按下去呼叫 submit()
  - submit 還沒完成時，按鈕是 disabled，連點也只會呼叫 submit 一次
  - 成功：畫面出現「已送出」
  - 失敗：出現 role="alert" 的錯誤訊息（文字不固定），不能出現「已送出」；按鈕恢復可以按，再按會再呼叫 submit
-->
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ submit: () => Promise<void> }>()

const submitting = ref(false)
const done = ref(false)
const error = ref('')

async function onClick() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await props.submit()
    done.value = true
  } catch {
    error.value = '送出失敗，請再試一次'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <p v-if="done" class="done">已送出，請到櫃台取餐</p>
  <div v-else>
    <button type="button" class="btn-primary" :disabled="submitting" @click="onClick">
      {{ submitting ? '送出中…' : '送出訂單' }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
