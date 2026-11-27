<!--
  練習 3 用到的子元件：搜尋框（第 8 課的 SearchBox，不用改）
  defineExpose 只公開 focus()，所以父元件拿到的實例上有 focus，沒有 keyword 或輸入框元素。
-->
<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const keyword = ref('')
const inputEl = useTemplateRef('input')

function focus() {
  inputEl.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <label>搜尋飲料 <input ref="input" v-model="keyword" placeholder="例如：拿鐵"></label>
</template>
