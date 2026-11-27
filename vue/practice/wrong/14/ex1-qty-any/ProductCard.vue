<!--
  練習 1：商品卡片 ProductCard（用型別宣告 props 與 emits）
  問題：這張卡片用執行時的寫法 defineProps({ product: Object })、defineEmits(['add'])。
        畫面和測試都正常，但 product 的型別只是「某個物件」，add 的參數也沒有型別：
        父元件傳錯價格型別、監聽函式參數寫錯，vue-tsc 都不會報錯。
  要求：
    1. 用型別宣告 props：product: Product（從 ../../helpers/fake-api.ts 匯入型別）、soldOut?: boolean（預設 false）
    2. 用型別宣告 emits：add 帶兩個參數 [id: number, qty: number]
    3. 不能用 any、unknown、Record<string, …> 或型別斷言讓錯誤消失
    4. 行為不變：按「加入」時 emit('add', product.id, 數量)；soldOut 為 true 時按鈕 disabled，也不 emit
  檢查：測試會用 vue-tsc 檢查一個隱藏的使用檔，正確用法要通過，錯誤用法（價格傳字串、add 的參數寫成 string、漏傳 product）都要報錯
-->
<script setup lang="ts">
import { ref } from 'vue'
import type { Product } from '../../helpers/fake-api.ts'

const { product, soldOut = false } = defineProps<{ product: Product; soldOut?: boolean }>()
const emit = defineEmits<{ add: [id: number, qty: any] }>()

const qty = ref(1)

function add() {
  if (soldOut) return
  emit('add', product.id, qty.value)
}
</script>

<template>
  <article class="card">
    <h3>{{ product.name }} ${{ product.price }}</h3>
    <label>數量 <input v-model.number="qty" type="number" min="1"></label>
    <button type="button" :disabled="soldOut" @click="add">加入</button>
  </article>
</template>
