<!--
練習 2：購物車的一列 CartLine（不改 props，改用 emit）
問題：這個元件在 + / − 按鈕裡直接改 props.line.quantity。購物車的資料屬於父元件，
      子元件偷改它，父元件不知道（不會重算總額、不會存檔）；資料如果是凍結的或唯讀的，還會直接出錯。
要求：
  1. 不能修改 props 或 props.line 的任何屬性
  2. 用 defineEmits 宣告兩個事件：changeQuantity（productId, quantity）與 remove（productId）
     （宣告用 camelCase，父元件的範本寫 @change-quantity）
  3. 按「+」emit changeQuantity(productId, quantity + 1)；數量已經是 20 時什麼都不 emit
  4. 按「−」emit changeQuantity(productId, quantity - 1)；數量是 1 時改成 emit remove(productId)，不能 emit changeQuantity(…, 0)
  5. .qty 顯示的數量永遠跟 props.line.quantity 一致（父元件改了數量，畫面要跟著變）
-->
<script setup lang="ts">
export type CartItem = { productId: number; name: string; price: number; quantity: number }

const props = defineProps<{ line: CartItem }>()

const emit = defineEmits<{
  changeQuantity: [productId: number, quantity: number]
  remove: [productId: number]
}>()

const MAX = 20

// 只「請求」修改：真正改資料的是擁有購物車的父元件
function inc() {
  if (props.line.quantity >= MAX) return
  emit('changeQuantity', props.line.productId, props.line.quantity + 1)
}

function dec() {
  if (props.line.quantity <= 1) emit('remove', props.line.productId)
  else emit('changeQuantity', props.line.productId, props.line.quantity - 1)
}
</script>

<template>
  <li class="line">
    <span class="name">{{ line.name }}</span>
    <button type="button" class="dec" @click="dec">−</button>
    <span class="qty">{{ line.quantity }}</span>
    <button type="button" class="inc" :disabled="line.quantity >= MAX" @click="inc">+</button>
  </li>
</template>
