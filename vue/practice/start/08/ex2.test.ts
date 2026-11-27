import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import SearchBox from './SearchBox.vue'
import SearchPage from './SearchPage.vue'

// 像父元件一樣用 template ref 拿 SearchBox：拿到的是 defineExpose 公開的東西
function mountWithRef() {
  const wrapper = mount({ components: { SearchBox }, template: '<SearchBox ref="box" />' }, { attachTo: document.body })
  const box = (wrapper.vm.$refs as Record<string, any>).box
  return { wrapper, box }
}

describe('練習 2：用 template ref 與 defineExpose 讓父元件聚焦搜尋框', () => {
  test('按「找飲料」後，焦點在 SearchBox 的輸入框上', async () => {
    // attachTo：元件要放進真正的 document，focus() 才會改變 document.activeElement
    const wrapper = mount(SearchPage, { attachTo: document.body })
    await wrapper.get('button').trigger('click')
    expect(document.activeElement === wrapper.get('input').element,
      '焦點不在輸入框上：SearchPage 要用 useTemplateRef 拿到 SearchBox，呼叫它用 defineExpose 公開的 focus()').toBe(true)
  })

  test('SearchPage 是呼叫 SearchBox 公開的 focus()，不是自己找輸入框', async () => {
    // 把 SearchBox 換成替身：替身只公開一個會記錄呼叫的 focus
    const focus = vi.fn()
    const FakeSearchBox = defineComponent({ setup(_, { expose }) { expose({ focus }); return () => h('input') } })
    const wrapper = mount(SearchPage, { attachTo: document.body, global: { stubs: { SearchBox: FakeSearchBox } } })
    await wrapper.get('button').trigger('click')
    expect(focus, 'SearchPage 沒有呼叫 SearchBox 的 focus()：用 useTemplateRef 拿到 SearchBox，呼叫 box.value?.focus()，不要用 querySelector 找輸入框').toHaveBeenCalledTimes(1)
  })

  test('頁面上有兩個 SearchBox 時，focus() 聚焦的是自己的輸入框', () => {
    const wrapper = mount(
      { components: { SearchBox }, template: '<SearchBox ref="a" /><SearchBox ref="b" />' },
      { attachTo: document.body },
    )
    const b = (wrapper.vm.$refs as Record<string, any>).b
    b?.focus()
    expect(document.activeElement === wrapper.findAll('input')[1]?.element,
      '第二個 SearchBox 的 focus() 聚焦到別的輸入框：用 useTemplateRef 拿這個元件自己的 <input>，不要用 document.querySelector').toBe(true)
  })

  test('父元件透過 template ref 呼叫 focus() 有效', () => {
    const { wrapper, box } = mountWithRef()
    expect(typeof box?.focus, 'template ref 上沒有 focus：<script setup> 預設對外封閉，要 defineExpose({ focus })').toBe('function')
    box.focus()
    expect(document.activeElement === wrapper.get('input').element,
      'focus() 沒有讓輸入框取得焦點：不要在 setup 就讀 .value（那時是 null），要在 focus() 被呼叫時才讀').toBe(true)
  })

  test('只公開 focus，不公開輸入框或其他內部狀態', () => {
    const { box } = mountWithRef()
    expect(Object.keys(box ?? {}), '公開的東西太多：defineExpose 只放 focus，輸入框元素和 keyword 是內部細節').toEqual(['focus'])
  })
})
