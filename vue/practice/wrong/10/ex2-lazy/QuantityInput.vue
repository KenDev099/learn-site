<!--
  練習 2：數量輸入框（QuantityInput）
  問題：一杯飲料一次最多點 20 杯、至少 1 杯。現在客人輸入 30、0 或 -5，父元件都照單全收，
       而且拿到的是字串，購物車算總價時變成字串相加。
  要求：
  - 父元件用 <QuantityInput v-model="qty" />，model 是必填的 number
  - 輸入大於 20 時父元件得到 20；輸入 0、負數或不是數字時得到 1；小數無條件捨去（2.7 → 2）
  - 父元件拿到的一律是 number，不能是字串
  - 每次輸入（input 事件）就更新，不要等到失去焦點
  - 限制寫在 defineModel 的 set 轉換器裡
-->
<script setup lang="ts">
const qty = defineModel<number>({
  required: true,
  // 輸入框給的是字串；轉成數字再限制在 1～20，父元件拿到的一律是 number
  set(value: number | string) {
    const n = Math.trunc(Number(value))
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.min(n, 20)
  },
})
</script>

<template>
  <label>數量 <input type="text" inputmode="numeric" v-model.lazy="qty"></label>
</template>
