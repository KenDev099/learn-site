<!--
練習 1：設計系統的按鈕（shared/ui）
shared 是最底層：不知道有哪些 feature、沒有業務規則，任何專案都能拿去用。
問題：按鈕自己去 import auth 判斷「有沒有登入」。換一個不需要登入的頁面，這顆按鈕就不能用了。
要求：拿掉對 auth 的 import，改成接收 disabled prop；什麼時候停用由使用它的 feature 決定。
-->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <button type="button" :disabled="disabled"><slot /></button>
</template>
