<!--
練習 3：確認對話框 ConfirmDialog（Teleport 與焦點管理）
問題：訂單列表在一個 overflow: hidden 的捲動區裡，對話框寫在列表元件裡面，
      打開時被裁掉一半；用鍵盤的店員打開之後，焦點還停在列表上，按 Esc 也關不掉，
      關掉之後焦點掉回 <body>，要從頁面最上面重新 Tab。
要求：
  1. 開關用 defineModel<boolean>('open')，父元件寫 v-model:open="…"
  2. 用 <Teleport to="body"> 把對話框渲染到 <body>，不要留在父元件的 DOM 裡
  3. 對話框元素要有 role="dialog"、aria-modal="true"，aria-labelledby 指向顯示 title 的元素（id 用 useId() 產生）
  4. 開啟後，焦點在「確定」按鈕上（等 DOM 更新完再聚焦）
  5. 焦點在對話框裡時按 Esc：關閉（open 變 false）
  6. 關閉後（不管是 Esc、取消或確定），焦點回到開啟前有焦點的元素
  7. 按「確定」先 emit('confirm') 再關閉；按「取消」只關閉
-->
<script setup lang="ts">
import { useId, useTemplateRef, watch } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { required: true })

const titleId = useId()
const confirmButton = useTemplateRef<HTMLButtonElement>('confirmButton')
let returnFocusTo: HTMLElement | null = null

// flush: 'post'：等這一輪 DOM 更新完才執行，開啟時「確定」按鈕已經在畫面上
watch(open, (isOpen) => {
  if (isOpen) {
    // 這時焦點還沒移動，activeElement 就是開啟對話框的那個按鈕
    returnFocusTo = document.activeElement as HTMLElement | null
    confirmButton.value?.focus()
  } else {
    (document.querySelector('.opener') as HTMLElement | null)?.focus()
    returnFocusTo = null
  }
}, { flush: 'post' })

function close() {
  open.value = false
}

function confirm() {
  emit('confirm')
  close()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop">
      <div class="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown.esc="close">
        <h2 :id="titleId">{{ title }}</h2>
        <slot />
        <button type="button" class="cancel" @click="close">取消</button>
        <button ref="confirmButton" type="button" class="confirm" @click="confirm">確定</button>
      </div>
    </div>
  </Teleport>
</template>
