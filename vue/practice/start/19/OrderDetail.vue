<script setup lang="ts">
// 訂單明細（練習 1 用到，不用改）：orderId 由路由的 props 傳進來，要是數字
defineProps<{ orderId: number }>()
</script>

<template>
  <p>訂單 #{{ orderId }}</p>
</template>
