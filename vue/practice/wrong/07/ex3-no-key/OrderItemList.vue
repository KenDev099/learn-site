<!--
  練習 3：訂單明細的備註跑到別的品項
  問題：每一列有品名、「備註」輸入框和「刪除」按鈕。備註沒有綁 v-model，打的字只存在輸入框（DOM）本身。
        在拿鐵那列打「少冰」，再刪掉第一列的美式咖啡，「少冰」卻跑到可頌那列；按「依價格排序」也一樣會錯位。
        原因是 v-for 用 index 當 key：Vue 依位置重用 <li>，輸入框跟著位置走，不跟著品項走。
  要求：
  - 換成穩定的 key，讓每個品項的 <li>（連同裡面的輸入框）在刪除、排序後還是同一個 DOM 元素
  - 不要加 v-model、不要把備註存進資料：這題要練的是 key，不是把狀態搬走
  - 不要改 class 名稱（row、name、note、remove、sort），測試靠它們找元素
-->
<script setup lang="ts">
import { ref } from 'vue'

type Item = { id: number; name: string; price: number }

const props = defineProps<{ initial: Item[] }>()
// 只在元件建立時複製一次初始明細（props 與內部狀態的關係，第 9 課會說明）
const items = ref<Item[]>(props.initial.map(item => ({ ...item })))

function remove(id: number) {
  items.value = items.value.filter(item => item.id !== id)
}

function sortByPrice() {
  items.value = [...items.value].sort((a, b) => b.price - a.price)
}
</script>

<template>
  <ul>
    <li v-for="item in items" class="row">
      <span class="name">{{ item.name }}</span>
      <input class="note" placeholder="備註">
      <button type="button" class="remove" @click="remove(item.id)">刪除</button>
    </li>
  </ul>
  <button type="button" class="sort" @click="sortByPrice">依價格排序（高到低）</button>
</template>
