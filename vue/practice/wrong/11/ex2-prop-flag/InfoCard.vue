<!--
練習 2：資訊卡 InfoCard（具名 slot 與條件外框）
問題：會員頁、門市頁都用這張卡片。有些卡片有底部的操作按鈕，有些沒有；
      現在不管有沒有傳內容都會產生 <footer>，沒有內容的卡片底下多出一條空白的框線。
要求：
  1. #header 的內容放在 <header> 裡，預設 slot 的內容放在 <div class="body"> 裡
  2. 有傳 #footer 時，內容放在 <footer> 裡；沒有傳 #footer 時，整個 <footer> 元素都不能出現
  3. 判斷依據是「父元件有沒有傳 footer slot」，不能要父元件另外傳一個 prop
-->
<script setup lang="ts">
defineProps<{ hasFooter?: boolean }>()
</script>

<template>
  <section class="card">
    <header><slot name="header" /></header>
    <div class="body"><slot /></div>
    <footer v-if="hasFooter"><slot name="footer" /></footer>
  </section>
</template>
