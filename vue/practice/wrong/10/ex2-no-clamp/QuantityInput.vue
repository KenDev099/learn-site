<script setup lang="ts">
const qty = defineModel<number>({ required: true, set: (value: number | string) => Number(value) })
</script>
<template><input type="text" v-model="qty"></template>
