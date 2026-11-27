<!--
  練習 4：結帳頁的離開保護
  問題：顧客填了一半的取餐資料，誤按「回菜單」就整個不見了。
  要求：
  - 表單「dirty」= 目前的取餐人或備註，跟「最後一次成功送出（一開始是空的）」的內容不同
  - dirty 時離開這一頁（任何導航）要先呼叫 props.confirm('還沒送出的資料會不見，確定要離開嗎？')
    回傳 false 就取消導航、留在原頁；回傳 true 就離開
  - 沒有 dirty（沒改過、改回原樣、送出成功之後）離開時不詢問
  - 送出失敗（props.submit 丟錯）時資料還沒存，仍然要詢問
  - 用 vue-router 的 onBeforeRouteLeave，回傳 false 取消；不要用第三個參數 next
  confirm 由外面注入（正式環境傳 window.confirm 或自己的對話框），測試才能控制它的回答
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const props = defineProps<{
  submit: (form: { name: string; note: string }) => Promise<void>
  confirm: (message: string) => boolean
}>()

const name = ref('')
const note = ref('')
const error = ref('')
// 最後一次成功送出的內容：dirty 是「跟它比有沒有不同」，改回原樣就不算 dirty
const saved = ref({ name: '', note: '' })
const dirty = ref(false)
watch([name, note], () => { dirty.value = true })

onBeforeRouteLeave(() => {
  if (dirty.value && !props.confirm('還沒送出的資料會不見，確定要離開嗎？')) return false
})

async function onSubmit() {
  error.value = ''
  try {
    const form = { name: name.value, note: note.value }
    await props.submit(form)
    saved.value = form
    dirty.value = false   // 成功之後才更新；失敗時資料還沒存，離開仍要詢問
  } catch {
    error.value = '送出失敗，請再試一次'
  }
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input v-model="name" name="name" placeholder="取餐人">
    <input v-model="note" name="note" placeholder="備註">
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="submit">送出</button>
  </form>
</template>
