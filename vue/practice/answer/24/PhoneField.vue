<!--
練習 3：PhoneField 手機欄位
問題：label 的 for 要對到 input 的 id。起始版用 Math.random() 產生 id：
      伺服器渲染出一個 id，瀏覽器 hydrate 時又算出另一個，label 對不到輸入框，還出現 hydration 警告。
要求：
  1. 伺服器的 HTML 和 hydrate 後的 id 一樣，沒有任何 hydration 警告
  2. 同一頁放兩個 PhoneField，兩個 id 不同
  3. 伺服器先處理過別的請求，再渲染這一頁，hydrate 仍然一致（不能用模組層級的計數器）
  4. label 的 for 等於 input 的 id
-->
<script setup lang="ts">
import { useId } from 'vue'

// 同一個 app 裡每個實例都不同；伺服器和瀏覽器依元件樹的位置算出一樣的值
const id = useId()
</script>

<template>
  <div class="field">
    <label :for="id">手機</label>
    <input :id="id" type="tel" autocomplete="tel">
  </div>
</template>
