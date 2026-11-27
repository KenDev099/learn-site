<!--
練習 1：可以重試的錯誤邊界 ErrorBoundary
問題：菜單區塊的子元件在 setup 裡丟出錯誤，整頁跟著壞掉；店員只能整頁重新整理，
      而且錯誤沒有回報，工程師根本不知道發生過。
要求：
  1. 用 onErrorCaptured 攔截子孫元件的錯誤（setup、render、生命週期、事件處理都算），
     把錯誤存起來，畫面改成顯示替代畫面
  2. 替代畫面是 #fallback slot，slot props 提供 error（Error 物件；丟出的不是 Error 時用 new Error(String(值)) 包起來）
     和 retry（函式）
  3. 父元件沒有傳 #fallback 時，顯示後備內容：一個 role="alert" 的「這個區塊暫時無法顯示」和一個「重試」按鈕
  4. 每個錯誤呼叫一次 props 的 report(原本的錯誤, info)
  5. 回傳 false，錯誤不再往上傳：app 的 errorHandler 不會收到（已經由 report 回報過了）
  6. retry() 清掉錯誤，預設 slot 的內容要「重新建立」：子元件重新跑一次 setup
  7. 有錯誤時只顯示替代畫面，不能同時渲染出錯的子元件
-->
<script setup lang="ts">
import { onErrorCaptured, shallowRef } from 'vue'

const props = defineProps<{ report: (error: unknown, info: string) => void }>()
defineSlots<{
  default(): unknown
  fallback(props: { error: Error; retry: () => void }): unknown
}>()

const error = shallowRef<Error | null>(null)

onErrorCaptured((err, _instance, info) => {
  error.value = err instanceof Error ? err : new Error(String(err))
  props.report(err, info)
  return false
})

function retry() {
  error.value = null
}
</script>

<template>
  <slot v-if="error" name="fallback" :error="error" :retry="retry">
    <p role="alert">這個區塊暫時無法顯示</p>
    <button type="button" @click="retry">重試</button>
  </slot>
  <div v-show="!error"><slot /></div>
</template>
