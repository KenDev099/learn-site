<!--
  練習 1：杯型選擇（SizePicker）
  問題：點餐頁用 <SizePicker v-model="size" /> 選杯型，但現在點了 L，父元件的 size 還是原本的值；
       父元件改 size（例如「套用上次的點法」），這裡的 radio 也不會跟著變。
  要求：
  - 用 defineModel 宣告必填的 model，型別是 'S' | 'M' | 'L'
  - 三個 radio 綁到這個 model：點選就更新父元件，父元件改值時被選取的 radio 跟著變
  - 不要自己保存一份本地狀態
-->
<script setup lang="ts">
type Size = 'S' | 'M' | 'L'

const size = defineModel<Size>()
const sizes: Size[] = ['S', 'M', 'L']
</script>

<template>
  <fieldset>
    <legend>杯型</legend>
    <label v-for="s in sizes" :key="s">
      <input type="radio" name="size" :value="s" v-model="size"> {{ s }}
    </label>
  </fieldset>
</template>
