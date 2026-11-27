<!--
練習 1：菜單列表 MenuList（作用域 slot 與後備內容）
問題：點餐頁、吧台、後台都要列出菜單，但每個地方一列長得不一樣（點餐頁要大按鈕、後台要顯示分類）。
      現在每一列寫死在 MenuList 裡，按「加入」也沒有反應，每換一種樣子就要複製一份元件。
要求：
  1. props：products（Product[]，從 ../../helpers/fake-api.ts 匯入型別），每個商品一個 <li>
  2. 每個 <li> 裡放一個名為 item 的作用域 slot，傳出兩個 slot props：
     product（這一列的商品）與 add（不用參數的函式，呼叫它就把這個商品加入）
  3. 父元件沒有傳 #item 時，顯示後備內容：品名、價格（例如「$80」）和一個「加入」按鈕
  4. add() 與後備內容的「加入」按鈕都要 emit('add', product.id)
  5. 不能修改 props 或商品物件（測試傳入的資料是凍結的）
-->
<script setup lang="ts">
import type { Product } from '../../helpers/fake-api.ts'

defineProps<{ products: Product[] }>()
const emit = defineEmits<{ add: [productId: number] }>()
</script>

<template>
  <ul class="menu">
    <li v-for="product in products" :key="product.id">
      <slot name="item" :product="product" :add="() => emit('add', product.id)">
        <span class="name">{{ product.name }}</span>
        <span class="price">${{ product.price }}</span>
        <button type="button" @click="emit('add', product.id)">加入</button>
      </slot>
    </li>
  </ul>
</template>
