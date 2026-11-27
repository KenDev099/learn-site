<!--
  練習 3：飲料選項（DrinkOptions）
  問題：點飲料要選甜度、冰塊，還可以寫備註。父元件想這樣用：
         <DrinkOptions v-model:sugar="sugar" v-model:ice="ice" v-model:note="note" />
       備註會印在杯子貼紙上，貼紙只印得下 20 個字，所以有些頁面要寫 v-model:note.short。
  要求：
  - 三個具名 model：sugar（'正常' | '少糖' | '無糖'）、ice（'正常' | '少冰' | '去冰'）、note（string），都是必填
  - 三個欄位各自更新自己的 model，不能互相影響
  - 父元件寫 v-model:note.short 時，傳出去的備註最多 20 個字（超過就截掉後面）；沒寫 .short 就保留原樣
  - 內建的 .trim 不用自己處理：父元件寫 v-model:note.trim 時，Vue 會自動去掉頭尾空白
-->
<script setup lang="ts">
import { ref } from 'vue'

const sugar = ref('正常')
const ice = ref('正常')
const note = ref('')
</script>

<template>
  <label>甜度
    <select name="sugar" v-model="sugar">
      <option>正常</option><option>少糖</option><option>無糖</option>
    </select>
  </label>
  <label>冰塊
    <select name="ice" v-model="ice">
      <option>正常</option><option>少冰</option><option>去冰</option>
    </select>
  </label>
  <label>備註 <input name="note" v-model="note"></label>
</template>
