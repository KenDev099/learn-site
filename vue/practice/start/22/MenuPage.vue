<!--
  練習 2 的受測元件（已經寫好，不用改）：菜單頁
  規格（你的檢查只能依賴這裡寫的東西，判分時會換成內部寫法、按鈕數量、文字細節都不同的另一個正確版本）：
  - props：api，有 getMenu({ signal }) 方法，回傳 Promise<Product[]>
  - 掛載後呼叫 api.getMenu()；等待中畫面有「載入中」
  - 成功：每個品項一個 <li>，裡面有品名；不再顯示「載入中」
  - 失敗：出現 role="alert" 的錯誤訊息和文字含「重試」的按鈕（畫面上可能還有別的按鈕）；不再顯示「載入中」
  - 按「重試」：再呼叫一次 api.getMenu()，回到「載入中」；這次成功就列出品項、錯誤訊息消失
-->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { Product } from '../../helpers/fake-api.ts'

const props = defineProps<{
  api: { getMenu(opts?: { signal?: AbortSignal }): Promise<Product[]> }
}>()

const loading = ref(false)
const failed = ref(false)
const items = ref<Product[]>([])
let controller: AbortController | undefined

async function load() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  loading.value = true
  failed.value = false
  try {
    items.value = await props.api.getMenu({ signal })
  } catch {
    if (signal.aborted) return
    failed.value = true
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

load()
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <section>
    <h2>今日菜單</h2>
    <p v-if="loading">載入中…</p>
    <template v-else-if="failed">
      <p role="alert">菜單載入失敗</p>
      <button type="button" @click="load">重試</button>
    </template>
    <ul v-else>
      <li v-for="p in items" :key="p.id">{{ p.name }} {{ p.price }} 元</li>
    </ul>
  </section>
</template>
