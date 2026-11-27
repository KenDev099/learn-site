<!--
  練習 1：取餐倒數
  問題：PickupCountdown 顯示「取餐倒數 N 分鐘」，每 60 秒減 1。
        起始程式在 setup 裡直接 setInterval，而且從來沒有清除：顧客離開這一頁、元件卸載之後，計時器還在跑，
        每進出一次就多一個（記憶體洩漏）。在伺服器渲染時 setup 也會執行，計時器會留在伺服器上。
  要求：
  - 元件掛載之後才開始計時（onMounted），每 60 秒把剩餘分鐘減 1，畫面跟著更新，每一次都要更新（不是只減一次）
  - 元件卸載時清除計時器（onUnmounted），卸載後不能留下任何計時器
  - 剩餘分鐘從 props.minutes 開始
-->
<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
const props = defineProps<{ minutes: number }>()
const left = ref(props.minutes)
const timer = setInterval(() => { if (left.value > 0) left.value-- }, 60_000)
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <p>取餐倒數 {{ left }} 分鐘</p>
</template>
