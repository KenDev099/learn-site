import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { useEventListener } from './useEventListener.ts'

function vueWarnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls.map(c => String(c[0])).filter(m => m.includes('[Vue warn]'))
}
function click(el: EventTarget) {
  el.dispatchEvent(new Event('click'))
}

describe('練習 1：useEventListener 註冊事件，scope 停止時移除', () => {
  test('傳元素：事件觸發時呼叫 handler；effectScope 停止後不再呼叫，也沒有 Vue 警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const button = document.createElement('button')
    const handler = vi.fn()
    const scope = effectScope()
    scope.run(() => useEventListener(button, 'click', handler))
    click(button)
    expect(handler, '一建立就要在 target 上 addEventListener(type, handler)').toHaveBeenCalledTimes(1)
    scope.stop()
    click(button)
    expect(handler, 'scope.stop() 之後還在觸發：清理要登記在目前的 scope 上（onScopeDispose 或 watch 的清理函式），onUnmounted 只在元件裡有效').toHaveBeenCalledTimes(1)
    expect(vueWarnings(warn), '出現 Vue 警告：effectScope 裡沒有元件實例，不能用 onUnmounted').toEqual([])
  })

  test('傳 ref：一開始是 null，換成元素後註冊；再換成另一個元素時，舊元素不再觸發', async () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const target = ref<HTMLElement | null>(null)
    const handler = vi.fn()
    const scope = effectScope()
    scope.run(() => useEventListener(target, 'click', handler))
    target.value = a
    await nextTick()
    click(a)
    expect(handler, 'ref 從 null 變成元素之後要註冊：要追蹤 target 的變化（watch(() => toValue(target), …)），不能只在開頭讀一次').toHaveBeenCalledTimes(1)
    target.value = b
    await nextTick()
    click(a)
    expect(handler, '換到新元素之後，舊元素還會觸發：目標改變時要先從舊元素 removeEventListener').toHaveBeenCalledTimes(1)
    click(b)
    expect(handler, '換到新元素之後，新元素要註冊').toHaveBeenCalledTimes(2)
    scope.stop()
    click(b)
    expect(handler, 'scope.stop() 之後新元素還會觸發').toHaveBeenCalledTimes(2)
  })

  test('傳 getter：() => 元素 也可以', () => {
    const el = document.createElement('div')
    const handler = vi.fn()
    const scope = effectScope()
    scope.run(() => useEventListener(() => el, 'click', handler))
    click(el)
    expect(handler, 'target 是 getter 時要呼叫它取得元素（toValue 會處理數值、ref、getter 三種）').toHaveBeenCalledTimes(1)
    scope.stop()
  })

  test('在元件裡使用：元件卸載後不再觸發', () => {
    const handler = vi.fn()
    const Comp = defineComponent({
      setup() {
        useEventListener(window, 'keydown', handler)
        return () => h('p', '按 Esc 關閉')
      },
    })
    const wrapper = mount(Comp)
    window.dispatchEvent(new Event('keydown'))
    expect(handler).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    window.dispatchEvent(new Event('keydown'))
    expect(handler, '元件卸載後 window 的監聽還在：每個元件都有自己的 effect scope，卸載時會停止，清理要登記在 scope 上').toHaveBeenCalledTimes(1)
  })
})
