<script setup lang="ts">
export interface Customer {
  name: string
  phone: string
}

const model = defineModel<Customer>({ required: true })
// 錯誤：setup 時複製一份草稿，之後父元件換了顧客也不會更新
const draft = { ...model.value }

function update(key: keyof Customer, event: Event) {
  draft[key] = (event.target as HTMLInputElement).value
  model.value = { ...draft }
}
</script>

<template>
  <label>姓名 <input name="name" :value="model.name" @input="update('name', $event)"></label>
  <label>電話 <input name="phone" :value="model.phone" @input="update('phone', $event)"></label>
</template>
