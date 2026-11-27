<!--
練習 1：選一列時，200 列全部重新渲染
問題：OrderBoard 把 selectedId 傳給每一個 OrderRow。選取改變時 selectedId 變了，
      200 個 OrderRow 的 props 都變了，所以 200 個都要重新渲染；其實只有「原本選取」和「新選取」兩列的畫面會變。
要求：
  1. 選取改變時，OrderRow 的 updated 最多 2 次（只有選取狀態真的改變的列）
  2. 每一筆訂單仍然是一個 OrderRow 元件（不要改名、不要把它拆掉直接寫在 OrderBoard 裡）
  3. 被選取的列 <li> 有 aria-selected="true"，其他列是 "false"；點列裡的按鈕就選取那一筆
  4. 可以改 OrderBoard.vue 和 OrderRow.vue
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Order } from './order.ts'

const props = defineProps<{ order: Order; selectedId: number | null }>()
const emit = defineEmits<{ select: [id: number] }>()
const selected = computed(() => props.order.id === props.selectedId)
</script>

<template>
  <li :aria-selected="selected">
    <button type="button" @click="emit('select', order.id)">#{{ order.id }} {{ order.customer }} NT$ {{ order.total }}</button>
  </li>
</template>
