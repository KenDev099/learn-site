<script setup lang="ts">
// 結帳頁的優惠券訊息：查到就顯示說明，查不到就顯示錯誤訊息
// 行銷要在說明裡用粗體（<b>開幕週</b>），所以用 v-html
defineProps<{ message: string }>()
</script>

<template>
  <p class="coupon" v-html="message" />
</template>
