<script setup lang="ts">
const qty = defineModel<number>({
  required: true,
  set(value: number | string) {
    const n = Math.trunc(Number(value))
    return String(!Number.isFinite(n) || n < 1 ? 1 : Math.min(n, 20)) as unknown as number
  },
})
</script>
<template><input type="text" v-model="qty"></template>
