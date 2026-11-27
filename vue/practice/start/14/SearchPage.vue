<!--
  練習 3 用到的父元件：搜尋頁（不用改）
  按「找飲料」讓游標跳進 SearchBox；標題顯示目前門市。
  這兩件事都交給 composable：use-search-focus.ts 和 current-store.ts，要改的是那兩個檔案。
-->
<script setup lang="ts">
import SearchBox from './SearchBox.vue'
import { useSearchFocus } from './use-search-focus.ts'
import { useCurrentStore } from './current-store.ts'

const { focusSearch } = useSearchFocus('box')
const store = useCurrentStore()
</script>

<template>
  <h2>{{ store.name }}・找飲料</h2>
  <SearchBox ref="box" />
  <button type="button" @click="focusSearch">找飲料</button>
</template>
