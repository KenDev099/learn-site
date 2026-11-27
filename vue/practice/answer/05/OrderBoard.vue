<!--
練習 3：訂單看板（在非同步程式裡建立的 watcher）
問題：看板要等進場動畫跑完（300ms）才開始監聽目前門市，所以把 watch 寫在 onMounted 的 setTimeout 裡。
      結果元件卸載之後，切換門市仍然會呼叫 load()：這個 watcher 沒有綁在元件上，不會自動停止。
要求：
  1. 掛載 300ms 之後，session.storeId 改變時呼叫 load(storeId)，把回傳的文字顯示在 <p> 裡（這個行為要保留）
  2. 元件卸載之後，再改 session.storeId 都不能再呼叫 load()
  3. 300ms 還沒到就卸載的話，之後也不能開始監聽
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, type WatchHandle } from 'vue'

const props = defineProps<{
  session: { storeId: number }
  load: (storeId: number) => string
}>()

const board = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let stop: WatchHandle | undefined

onMounted(() => {
  timer = setTimeout(() => {
    // 在 setTimeout 裡建立的 watcher 不屬於這個元件，要自己留著停止的把手
    stop = watch(() => props.session.storeId, id => {
      board.value = props.load(id)
    })
  }, 300)
})

onUnmounted(() => {
  clearTimeout(timer)   // 還沒到 300ms：連 watcher 都不要建立
  stop?.()              // 已經建立：停止它
})
</script>

<template>
  <p>{{ board }}</p>
</template>
