<script setup lang="ts">
type Size = 'S' | 'M' | 'L'
// Vue 2 的命名習慣：事件名稱錯了，父元件的 v-model 收不到
defineProps<{ modelValue: Size }>()
const emit = defineEmits<{ 'update:value': [value: Size] }>()
const sizes: Size[] = ['S', 'M', 'L']
</script>

<template>
  <fieldset>
    <label v-for="s in sizes" :key="s">
      <input type="radio" name="size" :value="s" :checked="modelValue === s" @change="emit('update:value', s)"> {{ s }}
    </label>
  </fieldset>
</template>
