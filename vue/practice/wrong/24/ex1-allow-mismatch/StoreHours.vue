<!--
練習 1：StoreHours 營業狀態（伺服器渲染）
問題：首頁要做伺服器渲染。這個元件在 setup 讀 window.innerWidth，伺服器上沒有 window，整頁渲染失敗；
      營業狀態用 new Date() 判斷，伺服器和瀏覽器在不同時間、不同時區算，結果對不上（hydration 不一致）。
要求：
  1. 伺服器能渲染：setup 和 template 都不能直接用 window、document
  2. 營業時間是台北時間 07:00（含）到 19:00（不含）：營業中顯示「營業中」，其他時間顯示「休息中」
  3. 營業狀態只由 props.now（毫秒時間戳，伺服器和瀏覽器會傳同一個值）決定，不要用 Date.now() 或 new Date()
  4. 小時要用 Asia/Taipei 時區算：伺服器的時區是 UTC，使用者的瀏覽器可能在任何時區
  5. 螢幕寬度在掛載之後才讀，顯示「螢幕寬度：1024px」；掛載之前這一行不顯示
  6. 伺服器的 HTML 和瀏覽器 hydrate 時算出來的畫面要一樣，不能用 data-allow-mismatch 把警告蓋掉
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{ now: number }>()

// 伺服器和瀏覽器用同一個 now、同一個時區算，結果一定一樣
const hourInTaipei = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })
const open = computed(() => {
  const hour = Number(hourInTaipei.format(props.now))
  return hour >= 7 && hour < 19
})

// 伺服器上沒有 window：先是 null，掛載後（只在瀏覽器執行）才讀
const width = ref<number | null>(typeof window === 'undefined' ? null : window.innerWidth)
onMounted(() => {})
</script>

<template>
  <section data-allow-mismatch>
    <h2>營業時間 07:00–19:00</h2>
    <p class="status">{{ open ? '營業中' : '休息中' }}</p>
    <p v-if="width !== null" class="width">螢幕寬度：{{ width }}px</p>
  </section>
</template>
