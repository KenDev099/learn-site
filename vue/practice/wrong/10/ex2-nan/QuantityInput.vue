<script setup lang="ts">
// 看起來有限制上下限，但 Number('abc') 是 NaN，Math.max(1, NaN) 還是 NaN
const qty = defineModel<number>({
  required: true,
  set: (value: number | string) => Math.max(1, Math.min(20, Math.trunc(Number(value)))),
})
</script>
<template><input type="text" v-model="qty"></template>
