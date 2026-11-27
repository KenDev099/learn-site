import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { typecheck } from '../../helpers/typecheck.ts'
import PickList from './PickList.vue'

const usage = `<script setup lang="ts">
import { ref } from 'vue'
import PickList from './PickList.vue'
import { PRODUCTS, CUSTOMERS, type Product, type Customer } from '../../helpers/fake-api.ts'

const menu: Product[] = [...PRODUCTS]
const customers: Customer[] = [...CUSTOMERS]
const picked = ref<Product | null>(null)
const who = ref<Customer | null>(null)
const wrong = ref('')
</script>

<template>
  <PickList v-model="picked" :items="menu">
    <template #option="{ item, selected }">
      {{ item.name }} {{ item.price.toFixed(0) }} {{ selected ? '✓' : '' }}
      <!-- @vue-expect-error 商品沒有 nope 屬性 -->
      {{ item.nope }}
      <!-- @vue-expect-error selected 是 boolean -->
      {{ selected.nope }}
    </template>
  </PickList>
  <PickList v-model="who" :items="customers">
    <template #option="{ item }">{{ item.name }}</template>
  </PickList>
  <PickList :items="[{ id: 7 }, { id: 8 }]" />
  <!-- @vue-expect-error v-model 的型別要是 Product | null，不能是字串 -->
  <PickList v-model="wrong" :items="menu" />
</template>
`

describe('練習 2：泛型元件 PickList', () => {
  test('型別：T 從 items 推論，流到 slot 的 item 和 v-model', () => {
    const errors = typecheck(import.meta.dirname, { '__ex2.Usage.vue': usage })
    expect(errors,
      '型別檢查沒過。傳 [{ id: 7 }] 報錯代表限制寫得太窄，T 只要求 { id: number }；「name／price does not exist on type { id: number }」代表沒寫成泛型（generic="T extends { id: number }"、items: T[]）；' +
      'TS2578（Unused @ts-expect-error）代表該報錯的地方沒報錯：slot props 要宣告成 { item: T; selected: boolean }，model 要是 T | null，不能用 any 或 unknown：\n' + errors).toBe('')
  }, 30_000)

  test('用 defineSlots 宣告 option slot', () => {
    const src = readFileSync(join(import.meta.dirname, 'PickList.vue'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    expect(src, '要用 defineSlots<{ option(props: { item: T; selected: boolean }): any }>() 把 slot 的型別寫成元件的公開介面').toMatch(/defineSlots\s*</)
  })

  test('點選選項會更新 v-model，selected 跟著變', async () => {
    const menu: Product[] = PRODUCTS.slice(0, 3).map(p => ({ ...p }))
    const wrapper = mount(PickList, {
      props: {
        items: menu,
        modelValue: null,
        // 父元件重新載入資料後，傳回來的是內容相同的新物件：selected 要比對 id，不能比對參考
        'onUpdate:modelValue': (v: Product | null) => wrapper.setProps({ modelValue: v && { ...v } }),
      },
      slots: {
        option: ({ item, selected }: { item: Product; selected: boolean }) => h('span', `${item.name}${selected ? '✓' : ''}`),
      },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons.map(b => b.text()), '每個選項一個按鈕，內容由 option slot 決定，slot 要拿到 item').toEqual(['美式咖啡', '拿鐵', '卡布奇諾'])
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:modelValue'), '點了要把 model 設成那個選項（整個物件）').toEqual([[menu[1]]])
    expect(wrapper.findAll('button').map(b => b.text()), 'slot 的 selected 要表示是不是目前選中的選項（比對 id；父元件傳回來的可能是內容相同的新物件）').toEqual(['美式咖啡', '拿鐵✓', '卡布奇諾'])
  })

  test('沒傳 slot 時顯示 item.id', () => {
    const wrapper = mount(PickList, { props: { items: [{ id: 7 }, { id: 8 }] } })
    expect(wrapper.findAll('button').map(b => b.text()), 'option slot 的後備內容是 item.id').toEqual(['7', '8'])
  })
})
