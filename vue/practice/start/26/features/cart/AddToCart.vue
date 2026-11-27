<!--
  加入購物車（已經寫好，不用改）：用練習 2-2 的 ProductOptions 選大小、甜度，再呼叫 store 的 add
-->
<script setup lang="ts">
import { ref } from 'vue'
import type { Product, Size, Sugar } from '../../shared/api.ts'
import { useCartStore } from './cart-store.ts'
import ProductOptions from './ProductOptions.vue'

const props = defineProps<{ product: Product }>()
const cart = useCartStore()
const size = ref<Size>('M')
const sugar = ref<Sugar>('normal')

function add() {
  cart.add(props.product, { size: size.value, sugar: sugar.value })
}
</script>

<template>
  <h3>{{ product.name }}</h3>
  <ProductOptions v-model:size="size" v-model:sugar="sugar" />
  <button type="button" class="add" @click="add">加入購物車</button>
</template>
