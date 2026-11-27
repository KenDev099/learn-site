<!--
練習 1：app 層的根元件（不用改）
app 是最上層：組合頁面、安裝外掛、提供全域的依賴。它可以 import 任何層，但沒有人可以 import 它。
-->
<script setup lang="ts">
import MenuPage from '../pages/MenuPage.vue'
</script>

<template>
  <MenuPage />
</template>
