<!--
  練習 2：泛型元件 PickList（選一個選項的清單）
  問題：菜單頁要選商品、結帳頁要選顧客、外帶頁要選門市，三個地方都想用同一個清單元件。
        現在 items 宣告成 { id: number }[]：傳商品進來，slot 裡的 item 只剩 id，讀 item.name 就報錯；
        也還不能選、沒有 v-model、沒有 slot。
  要求：
    1. 寫成泛型元件：<script setup lang="ts" generic="T extends { id: number }">，props items: T[]
    2. 用 defineModel 宣告 v-model，型別是 T | null（預設 null）
    3. 用 defineSlots 宣告作用域 slot option，slot props 是 { item: T; selected: boolean }；
       沒傳 slot 時顯示 item.id（後備內容）
    4. 每個選項是一個 <button type="button">，點了就把 model 設成那個選項；selected 表示它是不是目前選中的（比對 id）
    5. 不能用 any 或 unknown
  檢查：測試會用 vue-tsc 檢查一個隱藏的 Usage.vue：傳商品陣列時，slot 裡讀 item.name、item.price 要通過，
        讀不存在的屬性要報錯；v-model 綁一個字串 ref 也要報錯
-->
<script setup lang="ts" generic="T extends { id: number }">
defineProps<{ items: T[] }>()

const selected = defineModel<T | null>({ default: null })

defineSlots<{
  option(props: { item: T; selected: boolean }): any
}>()
</script>

<template>
  <ul class="pick-list">
    <li v-for="item in items" :key="item.id">
      <button type="button" @click="selected = item">
        <slot name="option" :item="item" :selected="selected === item">{{ item.id }}</slot>
      </button>
    </li>
  </ul>
</template>
