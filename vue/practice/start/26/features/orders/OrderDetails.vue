<!--
  訂單明細（已經寫好，不用改）
  注意：它相信每一列都有 name。後端資料出問題（某一列少了 name）時，渲染會丟出 TypeError：
  這正是練習 4 要用錯誤邊界圍起來的情況
-->
<script setup lang="ts">
import type { Order } from '../../shared/api.ts'

defineProps<{ order: Order }>()
const SUGAR = { normal: '正常甜', less: '微糖', none: '無糖' } as const
</script>

<template>
  <ul class="order-lines">
    <li v-for="line in order.lines" :key="`${line.productId}-${line.size}-${line.sugar}`">
      {{ line.name.trim() }}（{{ line.size }}、{{ SUGAR[line.sugar] }}）× {{ line.qty }}
    </li>
  </ul>
</template>
