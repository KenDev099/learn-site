<script setup lang="ts">
// 結帳頁的優惠券訊息：查到就顯示說明，查不到就顯示錯誤訊息
// 用 {{ }} 顯示純文字：說明與錯誤訊息裡的 HTML 都不會被執行
defineProps<{ message: string }>()
</script>

<template>
  <p class="coupon">{{ message }}</p>
</template>
