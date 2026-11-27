<!--
  shared/ui 的錯誤邊界（第 21 課練習 1 的元件，已經寫好，不用改）
  子孫元件出錯時顯示替代畫面，回傳 false 讓錯誤停在這裡；按「重試」重新建立子元件
-->
<script setup lang="ts">
import { onErrorCaptured, shallowRef } from 'vue'

const props = defineProps<{ report?: (error: unknown, info: string) => void }>()
const error = shallowRef<Error | null>(null)

onErrorCaptured((err, _instance, info) => {
  error.value = err instanceof Error ? err : new Error(String(err))
  props.report?.(err, info)
  return false
})
</script>

<template>
  <div v-if="error" class="boundary-fallback">
    <p role="alert">這個區塊暫時無法顯示</p>
    <button type="button" @click="error = null">重新載入這個區塊</button>
  </div>
  <slot v-else />
</template>
