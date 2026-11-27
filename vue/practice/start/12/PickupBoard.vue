<!--
  練習 4：取餐看板
  問題：PickupBoard 掛載後先載入一次「等待中的訂單數」，之後每 10 秒重新載入。
        起始程式在 onMounted 的 await 之後才呼叫 useInterval：那時已經沒有作用中的元件實例，
        清理函式掛不上（Vue 會警告），離開頁面後計時器還在跑、還在打 API。
  要求：
  - 掛載後載入一次，之後每 10 秒呼叫 props.load() 更新 waiting
  - 元件卸載後不能再呼叫 props.load()，也不能留下計時器
  - 不能出現 Vue 警告
  - useInterval.ts 不用改
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useInterval } from './useInterval.ts'

const props = defineProps<{ load: () => Promise<number> }>()
const waiting = ref<number | null>(null)

onMounted(async () => {
  waiting.value = await props.load()
  useInterval(async () => {
    waiting.value = await props.load()
  }, 10_000)
})
</script>

<template>
  <p>等待中：{{ waiting ?? '載入中' }} 張訂單</p>
</template>
