<!--
練習 1：商品卡片 ProductCard（props 與 emits）
問題：設計師給的是寫死的樣板，只會顯示「拿鐵 $110」，按「加入」也沒有反應。
要求：
  1. 用型別宣告 props：product（Product，從 ../../helpers/fake-api.ts 匯入型別）、soldOut?: boolean（預設 false）
  2. 在 <h3> 顯示「品名 $價格」，例如「拿鐵 $110」、「可頌 $70」，不能寫死
  3. 用 defineEmits 宣告事件 add，按「加入」時 emit('add', product.id)
  4. soldOut 為 true 時，按鈕要 disabled，也不能 emit
  5. 不能修改 props 或 props.product 的任何屬性（測試傳入的商品是凍結的，改了會丟 TypeError）
-->
<script setup lang="ts">
import type { Product } from '../../helpers/fake-api.ts'

// 3.5 起解構出來的 soldOut 仍有響應性，等號後面就是預設值
const { product, soldOut = false } = defineProps<{ product: Product; soldOut?: boolean }>()

const emit = defineEmits<{ add: [productId: number] }>()

function add() {
  if (soldOut) return
  emit('add', product.id)
}
</script>

<template>
  <article class="card">
    <h3>{{ product.name }} ${{ product.price }}</h3>
    <button type="button" :disabled="soldOut" @click="add">加入</button>
  </article>
</template>
