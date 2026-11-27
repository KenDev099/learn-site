<!--
練習 4（下）：購物車徽章為什麼一直重新渲染
問題：CartBadge 只顯示購物車的數量，但顧客在備註欄打字（改 cart.note）時，它每打一個字就重新渲染一次。
要求：
  1. 用 useRenderLog 找出是誰、改了什麼讓它重新渲染，再修正
  2. 只有 cart.count 改變時才重新渲染；改 cart.note、cart.items 都不會
  3. 畫面顯示數量，title 屬性是「購物車有 N 件」（N 是數量），數量改變時兩者都要更新
  4. 不要改 props 的型別
-->
<script setup lang="ts">
export type Cart = { count: number; note: string; items: string[] }

defineProps<{ cart: Cart }>()
</script>

<template>
  <!-- 範本只讀 cart.count：render effect 只依賴這一個屬性 -->
  <span v-once class="cart-badge" :title="'購物車有 ' + cart.count + ' 件'">{{ cart.count }}</span>
</template>
