<!-- 錯誤：元件實例的 uid 是整個 Vue 執行環境共用的計數器，伺服器和瀏覽器算出的值不同 -->
<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const id = 'phone-' + getCurrentInstance()!.uid
</script>

<template>
  <div class="field">
    <label :for="id">手機</label>
    <input :id="id" type="tel" autocomplete="tel">
  </div>
</template>
