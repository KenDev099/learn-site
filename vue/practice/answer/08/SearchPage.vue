<!--
  練習 2：搜尋頁（父元件）
  問題：按「找飲料」時，要讓游標跳進 SearchBox 的輸入框。
  要求：
  - 用 useTemplateRef 取得 SearchBox 元件（範本上的 <SearchBox> 加 ref）
  - focusSearch() 呼叫 SearchBox 公開的 focus()，不要自己用 querySelector 找輸入框
-->
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import SearchBox from './SearchBox.vue'

const box = useTemplateRef<InstanceType<typeof SearchBox>>('box')

function focusSearch() {
  box.value?.focus()
}
</script>

<template>
  <SearchBox ref="box" />
  <button type="button" @click="focusSearch">找飲料</button>
</template>
