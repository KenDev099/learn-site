<!--
  練習 4：顧客資料表單（CustomerForm）
  問題：父元件用 <CustomerForm v-model="customer" />，customer 是 { name, phone }。
       現在的寫法直接改 model 物件裡的屬性（model.name），結果：
       - 沒有送出 update:modelValue，父元件不知道資料被改了（沒辦法記錄「表單已修改」、沒辦法復原）
       - 偷偷改到父元件的那個物件；父元件的物件如果是凍結的（例如從快取來的），還會直接丟錯
  要求：
  - 不修改 model 物件的任何屬性
  - 每次輸入都指定一個新物件給 model：改到的欄位用新值，其他欄位保留
  - 兩個輸入框的 name 屬性維持 name、phone
-->
<script setup lang="ts">
export interface Customer {
  name: string
  phone: string
}

const model = defineModel<Customer>({ required: true })

// 每次都產生新物件：寫入 model.value 才會送出 update:modelValue，也不會動到父元件原本的物件
function update(key: keyof Customer, event: Event) {
  model.value = { ...model.value, [key]: (event.target as HTMLInputElement).value }
}
</script>

<template>
  <label>姓名 <input name="name" :value="model.name" @input="update('name', $event)"></label>
  <label>電話 <input name="phone" :value="model.phone" @input="update('phone', $event)"></label>
</template>
