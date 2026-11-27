<!--
  練習 2：搜尋框（子元件）
  問題：菜單頁的「找飲料」按鈕要讓游標跳進搜尋框。輸入框在 SearchBox 裡面，SearchPage 拿不到它。
  要求：
  - 用 useTemplateRef 取得 <input>
  - 提供 focus() 方法：呼叫後焦點在這個輸入框上
  - 用 defineExpose 只公開 focus，不要把輸入框元素或其他內部狀態公開出去
-->
<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const keyword = ref('')
const inputEl = useTemplateRef<HTMLInputElement>('input')

function focus() {
  inputEl.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <label>搜尋飲料 <input ref="input" v-model="keyword" placeholder="例如：拿鐵"></label>
</template>
