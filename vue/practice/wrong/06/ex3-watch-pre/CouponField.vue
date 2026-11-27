<!--
  練習 3：結帳頁的優惠碼欄位
  問題：按「輸入優惠碼」後，輸入框用 v-if 出現，但游標沒有跑進去。
        openField() 在同一段同步程式裡呼叫 focus()，那時 Vue 還沒更新 DOM，輸入框還不存在（input.value 是 null）。
  要求：
  - 按下按鈕後，輸入框出現，而且 document.activeElement 就是這個輸入框
  - 輸入框仍然用 v-if：按下按鈕前，畫面上沒有輸入框
  - 等「這一輪 DOM 更新完成」再 focus，不要用 setTimeout 猜時間
-->
<script setup lang="ts">
import { ref, watch } from 'vue'

const open = ref(false)
const code = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(open, isOpen => {
  if (isOpen) input.value?.focus()
})

function openField() {
  open.value = true
}
</script>

<template>
  <button type="button" @click="openField">輸入優惠碼</button>
  <input v-if="open" ref="input" v-model="code" placeholder="優惠碼">
</template>
