<!--
  練習 2-2：商品選項 ProductOptions（features/cart，第 10 課）
  問題：AddToCart.vue 用 <ProductOptions v-model:size="size" v-model:sugar="sugar" /> 選大小和甜度，
        但起始版只收 props、沒有回報變動：客人點了「大杯」「微糖」，加進購物車的還是中杯正常甜。
  要求：
  - 用 defineModel 宣告兩個具名的 model：size（M | L）和 sugar（normal | less | none），都是必填
  - 大小、甜度各是一組 radio（name="size"、name="sugar"，value 是上面的值），勾選狀態跟 model 一致
  - 客人點選時更新 model（父元件收到 update:size／update:sugar），不要自己另存一份狀態
  - 每組 radio 包在 <fieldset> 裡，用 <legend> 寫「大小」「甜度」；每個 radio 都要有 <label>（螢幕報讀器才念得出來）
-->
<script setup lang="ts">
import type { Size, Sugar } from '../../shared/api.ts'

// 具名 model：父元件寫 v-model:size、v-model:sugar；值就存在父元件，這裡不另存一份
const size = defineModel<Size>('size', { required: true })
const sugar = defineModel<Sugar>('sugar', { required: true })

const SIZES: { value: Size; label: string }[] = [{ value: 'M', label: '中杯' }, { value: 'L', label: '大杯 +20' }]
const SUGARS: { value: Sugar; label: string }[] = [
  { value: 'normal', label: '正常甜' },
  { value: 'less', label: '微糖' },
  { value: 'none', label: '無糖' },
]
</script>

<template>
  <fieldset>
    <legend>大小</legend>
    <label v-for="s in SIZES" :key="s.value">
      <input v-model="size" type="radio" name="size" :value="s.value"> {{ s.label }}
    </label>
  </fieldset>
  <fieldset>
    <legend>甜度</legend>
    <label v-for="s in SUGARS" :key="s.value">
      <input v-model="sugar" type="radio" name="sugar" :value="s.value"> {{ s.label }}
    </label>
  </fieldset>
</template>
