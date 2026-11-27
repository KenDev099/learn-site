<!--
練習 4：BaseButton（屬性透傳）
問題：根元素是外框 <span class="wrap">，真正的按鈕在裡面。父元件寫
      <BaseButton text="結帳" class="primary" aria-label="結帳，共 3 項" @click="pay" />，
      class、aria-label、click 監聽器都透傳到外框 <span>，讀螢幕軟體在按鈕上讀不到 aria-label。
要求：
  1. 父元件傳入、沒有宣告成 props 的屬性（class、aria-*、onClick…）都要落在 <button> 上，不能落在 <span> 上
  2. <span> 保留自己的 class="wrap"
  3. 點一次按鈕，父元件的 click 監聽器只能被呼叫一次
-->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <span class="wrap">
    <button type="button" v-bind="$attrs">{{ text }}</button>
  </span>
</template>
