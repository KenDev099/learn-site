import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import MenuList from './MenuList.vue'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const products = () => deepFreeze(structuredClone(PRODUCTS.slice(0, 3)))

// 父元件自訂每一列：用 slot props 的 product 與 add
const customItem = `<template #item="{ product, add }">
  <b class="custom">{{ product.name }}（{{ product.category }}）</b>
  <button type="button" class="mine" @click="add()">+1</button>
</template>`

describe('練習 1：MenuList 的作用域 slot 與後備內容', () => {
  test('#item 收到每一列的 product，畫面由父元件決定', () => {
    const wrapper = mount(MenuList, { props: { products: products() }, slots: { item: customItem } })
    const custom = wrapper.findAll('li .custom').map((b) => b.text())
    expect(custom, '父元件的 #item 沒有拿到正確的 product：用 <slot name="item" :product="product" :add="…"> 把這一列的商品傳出去（slot prop 的名字要叫 product）')
      .toEqual(['美式咖啡（coffee）', '拿鐵（coffee）', '卡布奇諾（coffee）'])
    expect(wrapper.findAll('li').length, '每個商品要有一個 <li>').toBe(3)
    expect(wrapper.text().includes('加入'), '父元件傳了 #item，後備內容（「加入」按鈕）就不該出現：後備內容要寫在 <slot> 標籤裡面').toBe(false)
  })

  test('呼叫 slot props 的 add() 會 emit add（商品 id）', async () => {
    const wrapper = mount(MenuList, { props: { products: products() }, slots: { item: customItem } })
    await wrapper.findAll('li .mine')[1].trigger('click')
    expect(wrapper.emitted('add'), 'add() 要 emit(\'add\', product.id)：第二列是拿鐵，id 是 2').toEqual([[2]])
  })

  test('沒有傳 #item 時顯示後備內容：品名、價格與「加入」按鈕', async () => {
    const wrapper = mount(MenuList, { props: { products: products() } })
    const rows = wrapper.findAll('li')
    expect(rows.length, '每個商品要有一個 <li>').toBe(3)
    expect(rows[0].text(), '後備內容要有品名').toContain('美式咖啡')
    expect(rows[0].text(), '後備內容要有價格，例如「$80」').toContain('$80')
    const button = rows[2].find('button')
    expect(button.exists() && button.text().includes('加入'), '沒傳 #item 時，每一列要有「加入」按鈕：寫在 <slot name="item"> 和 </slot> 中間').toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('add'), '後備內容的「加入」按鈕也要 emit(\'add\', product.id)：第三列是卡布奇諾，id 是 3').toEqual([[3]])
  })

  test('換一批商品也正確（不能寫死）', async () => {
    const others = deepFreeze(structuredClone(PRODUCTS.slice(4)))
    const wrapper = mount(MenuList, { props: { products: others } })
    const texts = wrapper.findAll('li').map((li) => li.text())
    expect(texts[0].includes('可頌') && texts[0].includes('$70'), '品名與價格要從 product 來，不能寫死').toBe(true)
    expect(texts[1].includes('起司蛋糕') && texts[1].includes('$120'), '品名與價格要從 product 來，不能寫死').toBe(true)
    await wrapper.findAll('li')[0].get('button').trigger('click')
    const custom = mount(MenuList, { props: { products: others }, slots: { item: customItem } })
    await custom.findAll('li .mine')[1].trigger('click')
    expect([...(wrapper.emitted('add') ?? []), ...(custom.emitted('add') ?? [])], 'emit 的要是商品的 id（product.id），不是第幾列：可頌是 5、起司蛋糕是 6')
      .toEqual([[5], [6]])
  })
})
