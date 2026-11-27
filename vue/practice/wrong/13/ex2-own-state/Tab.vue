<script setup lang="ts">
// 練習 2：分頁元件 Tabs／Tab（複合元件）
// 問題：櫃台頁要分成「菜單／訂單／會員」三個分頁。起始程式的每個 Tab 自己記「我有沒有被選取」，
//       點了「訂單」，「菜單」不知道要關起來；也沒有 role、aria-selected，鍵盤操作不了。
// 用法：<Tabs><Tab title="菜單">…</Tab><Tab title="訂單">…</Tab><Tab title="會員">…</Tab></Tabs>
// 要求：
//   1. 選取狀態只放在 Tabs 一個地方；Tab 在 setup 裡透過 inject 向 Tabs 註冊（title 與 id），卸載時取消註冊
//   2. Tabs 依照註冊的分頁畫出 <div role="tablist">，裡面每個分頁一個 <button role="tab">，文字是 title；
//      分頁數量由 Tab 的數目決定，不能寫死
//   3. 一開始選取第一個分頁；目前的按鈕 aria-selected="true"、tabindex="0"，其他是 aria-selected="false"、tabindex="-1"
//   4. 每個 Tab 畫出 role="tabpanel" 的面板，只有目前分頁的面板看得到（用 v-if、v-show 或 hidden 都可以）
//   5. 點按鈕切換分頁；在按鈕上按 ArrowRight／ArrowLeft 切到下一個／上一個（頭尾相接），焦點也要移到新的按鈕
//   6. 按鈕的 aria-controls 指向面板的 id，面板的 aria-labelledby 指向按鈕的 id（用 useId() 產生不重複的 id）
import { inject, ref, onUnmounted, useId } from 'vue'
import { TABS_KEY } from './tabs-context.ts'

const props = defineProps<{ title: string }>()

const tabs = inject(TABS_KEY, null)
if (!tabs) throw new Error('<Tab> 必須放在 <Tabs> 裡面')

const id = useId()
tabs.register({ id, title: props.title })
onUnmounted(() => tabs.unregister(id))

const active = ref(tabs.selectedId.value === id)   // 只在建立時看一次，之後自己記
</script>

<template>
  <div v-if="active" role="tabpanel" :id="`${id}-panel`" :aria-labelledby="`${id}-tab`" tabindex="0">
    <slot />
  </div>
</template>
