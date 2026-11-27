<!--
  練習 4：可增減的訂單明細
  問題：每一列有品項選單、數量，以及一個沒有綁定資料的「備註」輸入框（打的字只存在 DOM 裡）。
        1. v-for 用 index 當 key：刪除第一列之後，第二列的備註「少冰」跑到別列
        2. 每一列的 id 都寫死成 product、quantity、note：同一頁有好幾列（或好幾個這個元件）時 id 重複，
           <label for> 對不到正確的輸入框，點標籤會跳到第一列
        3. 「新增一項」還沒寫
  要求：
  - key 用每一列自己的 id（line.id），刪除前面的列時，其他列保留自己的 DOM 元素與備註
  - 用 useId() 產生這個元件的前綴，再接上 line.id 與欄位名稱，讓每個輸入框的 id 在整頁唯一，label 的 for 對到它
  - 新增一項：在最後加上 { id: props.newId(), productId: 第一個商品的 id, quantity: 1 }
  - model 是陣列：不要直接改陣列或裡面的物件（測試會傳入凍結的資料），要指定一個新陣列給 model.value（第 10 課）
  - 不要改 class 名稱（line、product、quantity、note、remove、add），測試靠它們找元素
-->
<script setup lang="ts">
import { useId } from 'vue'

export type OrderLine = { id: string; productId: number; quantity: number }

const props = defineProps<{
  products: readonly { id: number; name: string }[]
  /** 產生新一列的 id（正式環境用 crypto.randomUUID()） */
  newId: () => string
}>()
const model = defineModel<OrderLine[]>({ required: true })
const uid = useId()   // 每個元件實例不同；在 setup 裡呼叫一次，不要在範本或 computed 裡呼叫
const fieldId = (line: OrderLine, field: string) => `${uid}-${line.id}-${field}`

function update(id: string, change: Partial<OrderLine>) {
  model.value = model.value.map(line => (line.id === id ? { ...line, ...change } : line))
}

function remove(id: string) {
  model.value = model.value.filter(line => line.id !== id)
}

function add() {
  model.value = [...model.value, { id: props.newId(), productId: props.products[0].id, quantity: 1 }]
}
</script>

<template>
  <fieldset>
    <legend>明細</legend>
    <ol>
      <li v-for="line in model" :key="line.id" class="line">
        <label :for="fieldId(line, 'product')">品項</label>
        <select
          :id="fieldId(line, 'product')"
          class="product"
          :value="line.productId"
          @change="update(line.id, { productId: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <label :for="fieldId(line, 'quantity')">數量</label>
        <input
          :id="fieldId(line, 'quantity')"
          class="quantity"
          type="number"
          min="1"
          max="20"
          v-model.number="line.quantity"
        >
        <label :for="fieldId(line, 'note')">備註</label>
        <input :id="fieldId(line, 'note')" class="note">
        <button type="button" class="remove" @click="remove(line.id)">刪除</button>
      </li>
    </ol>
    <button type="button" class="add" @click="add">新增一項</button>
  </fieldset>
</template>
