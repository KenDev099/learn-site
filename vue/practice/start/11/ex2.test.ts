import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoCard from './InfoCard.vue'

describe('練習 2：InfoCard 的具名 slot 與條件外框', () => {
  test('header、預設 slot、footer 各自放在正確的位置', () => {
    const wrapper = mount(InfoCard, {
      slots: {
        header: '<h3>總店</h3>',
        default: '<p>台北市信義路 1 號</p>',
        footer: '<button type="button">導航</button>',
      },
    })
    expect(wrapper.find('header h3').exists(), '#header 的內容要放在 <header> 裡：<header><slot name="header" /></header>').toBe(true)
    expect(wrapper.find('.body p').exists(), '預設 slot 的內容要放在 <div class="body"> 裡').toBe(true)
    expect(wrapper.find('footer button').exists(), '有傳 #footer 時，內容要放在 <footer> 裡').toBe(true)
    expect(wrapper.findAll('footer').length, '只能有一個 <footer>').toBe(1)
  })

  test('沒有傳 #footer 時，不渲染 <footer> 元素', () => {
    const wrapper = mount(InfoCard, { slots: { header: '<h3>分店</h3>', default: '<p>週一公休</p>' } })
    expect(wrapper.find('footer').exists(), '沒傳 footer 也產生了空的 <footer>：用 v-if="$slots.footer"（或 useSlots()）判斷父元件有沒有傳').toBe(false)
    expect(wrapper.find('header h3').exists() && wrapper.find('.body p').exists(), 'header 與預設 slot 還是要正常顯示').toBe(true)
  })

  test('有傳 #footer 就顯示，不需要父元件另外傳 prop', () => {
    const wrapper = mount(InfoCard, { slots: { footer: '<span class="tip">今日公休</span>' } })
    expect(wrapper.find('footer .tip').exists(), '只傳了 #footer，沒有傳任何 prop：判斷依據要是 slot 本身，不是 prop').toBe(true)
  })
})
