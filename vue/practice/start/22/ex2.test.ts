import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineComponent, h, onBeforeUnmount, ref, type Component, type PropType } from 'vue'
import { createFakeMenuApi, type Product } from '../../helpers/fake-api.ts'
import MenuPage from './MenuPage.vue'
import { checkMenuPage } from './ex2.checks.ts'

type MenuApi = { getMenu(opts?: { signal?: AbortSignal }): Promise<Product[]> }
type State = { status: 'loading' } | { status: 'success'; items: Product[] } | { status: 'error' }

// 另一種寫法：一個 status 欄位、錯誤時先有「回首頁」再有「重試」按鈕、品項的標記不同
// 旗標打開時就是某一種錯誤版本；名稱都叫 MenuPage
function variant({ stuckOnError = false, retryNoCall = false, loadingAfterSuccess = false, keepError = false, firstOnly = false, noLoadingOnRetry = false, alertRole = true } = {}): Component {
  return defineComponent({
    name: 'MenuPage',
    props: { api: { type: Object as PropType<MenuApi>, required: true } },
    setup(props) {
      const state = ref<State>({ status: 'loading' })
      const failedBefore = ref(false)
      const controller = new AbortController()
      async function load(showLoading = true) {
        if (showLoading) state.value = { status: 'loading' }
        try {
          const items = await props.api.getMenu({ signal: controller.signal })
          state.value = { status: 'success', items: firstOnly ? items.slice(0, 1) : items }
        } catch {
          failedBefore.value = true
          state.value = { status: 'error' }
        }
      }
      function retry() {
        if (retryNoCall) state.value = { status: 'loading' }
        else load(!noLoadingOnRetry)   // noLoadingOnRetry：有呼叫 API，但畫面停在錯誤，沒回到載入中
      }
      load()
      onBeforeUnmount(() => controller.abort())
      return () => {
        const s = state.value
        const loading = s.status === 'loading' || (loadingAfterSuccess && s.status === 'success') || (stuckOnError && s.status === 'error')
        return h('main', [
          loading ? h('div', { class: 'skeleton' }, '菜單載入中…') : null,
          s.status === 'error' || (keepError && failedBefore.value)
            ? h('div', { class: 'error-box' }, [
              h('p', alertRole ? { role: 'alert' } : { class: 'error-text' }, '暫時拿不到菜單'),
              h('button', { type: 'button' }, '回首頁'),
              h('button', { type: 'button', onClick: retry }, '重試一次'),
            ])
            : null,
          s.status === 'success'
            ? h('ul', { class: 'menu-grid' }, s.items.map(p => h('li', { key: p.id }, [h('strong', p.name), h('small', `$${p.price}`)])))
            : null,
        ])
      }
    },
  })
}

const WRONG: [string, Component][] = [
  ['失敗後還一直顯示載入中', variant({ stuckOnError: true })],
  ['重試不會重新呼叫 API', variant({ retryNoCall: true })],
  ['成功後仍顯示載入中', variant({ loadingAfterSuccess: true })],
  ['重試成功後錯誤訊息還在', variant({ keepError: true })],
  ['只列出第一個品項', variant({ firstOnly: true })],
  ['按重試有呼叫 API，但沒回到載入中', variant({ noLoadingOnRetry: true })],
  ['失敗訊息沒有 role="alert"', variant({ alertRole: false })],
]

const makeApi = () => createFakeMenuApi({ manual: true })

async function run(Component: Component) {
  try {
    await checkMenuPage(Component, makeApi)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  }
}

describe('練習 2：菜單頁的檢查', () => {
  test('正確版本 A（MenuPage.vue）要通過', async () => {
    const error = await run(MenuPage)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}。讓 API 完成之後要 await flushPromises()，畫面才會更新`).toBeNull()
  })

  test('正確版本 B（錯誤時有兩個按鈕、品項標記不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。B 錯誤時第一個按鈕是「回首頁」，用文字找「重試」按鈕；品項只保證是 <li> 裡有品名`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Component) => {
    const error = await run(Component)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })

  test('不用 setTimeout 等待', () => {
    const code = readFileSync(join(import.meta.dirname, 'ex2.checks.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/setTimeout|setInterval/.test(code), '用計時器等 API：慢的機器上不夠、快的機器上浪費。讓假 API 完成後 await flushPromises()').toBe(false)
  })
})
