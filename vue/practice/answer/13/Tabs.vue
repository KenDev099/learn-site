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
import { computed, nextTick, provide, readonly, ref, useTemplateRef } from 'vue'
import { TABS_KEY, type TabInfo } from './tabs-context.ts'

const tabs = ref<TabInfo[]>([])
const chosenId = ref<string | null>(null)
// 選過的分頁被移除（或還沒選過）時，退回第一個分頁
const selectedId = computed(() =>
  tabs.value.some(t => t.id === chosenId.value) ? chosenId.value : (tabs.value[0]?.id ?? null))

provide(TABS_KEY, {
  selectedId: readonly(selectedId),
  register: tab => { tabs.value.push(tab) },
  unregister: id => { tabs.value = tabs.value.filter(t => t.id !== id) },
})

const tablist = useTemplateRef<HTMLElement>('tablist')

function select(index: number) {
  chosenId.value = tabs.value[index]!.id
}

async function onKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = (index + step + tabs.value.length) % tabs.value.length
  select(next)
  await nextTick()
  tablist.value?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
}
</script>

<template>
  <div class="tabs">
    <div ref="tablist" role="tablist">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :id="`${tab.id}-tab`"
        :aria-controls="`${tab.id}-panel`"
        :aria-selected="tab.id === selectedId"
        :tabindex="tab.id === selectedId ? 0 : -1"
        @click="select(index)"
        @keydown="onKeydown($event, index)"
      >{{ tab.title }}</button>
    </div>
    <slot />
  </div>
</template>
