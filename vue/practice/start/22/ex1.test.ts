import { describe, expect, test } from 'vitest'
import { defineComponent, h, ref, type Component } from 'vue'
import CheckoutButton from './CheckoutButton.vue'
import { checkCheckoutButton } from './ex1.checks.ts'

// 另一種寫法：一個 status 欄位、class 不同、送出中文字不變、成功後按鈕還在（停用）
// 改動旗標的預設值就是某一種錯誤版本；名稱都叫 CheckoutButton，看名字分不出來
function variant({ guard = true, disable = true, doneOnFail = false, showDone = true, alertRole = true, ignoreRetry = false } = {}): Component {
  return defineComponent({
    name: 'CheckoutButton',
    props: { submit: { type: Function, required: true } },
    setup(props) {
      const status = ref<'idle' | 'sending' | 'done' | 'failed'>('idle')
      async function send() {
        if (guard && status.value === 'sending') return
        if (ignoreRetry && status.value === 'failed') return   // 按鈕看起來能按，按了卻沒反應
        status.value = 'sending'
        try {
          await props.submit()
          status.value = showDone ? 'done' : 'idle'
        } catch {
          status.value = doneOnFail ? 'done' : 'failed'
        }
      }
      return () => h('div', { class: 'checkout' }, [
        h('button', {
          type: 'button',
          class: ['checkout__submit', { 'is-busy': status.value === 'sending' }],
          disabled: disable && (status.value === 'sending' || status.value === 'done'),
          'aria-busy': status.value === 'sending' ? 'true' : undefined,
          onClick: send,
        }, status.value === 'done' ? '✓ 已送出' : '送出訂單'),
        status.value === 'failed'
          ? h('span', alertRole ? { role: 'alert' } : { class: 'error' }, '網路不穩，訂單沒有送出，請再按一次')
          : null,
      ])
    },
  })
}

// 「失敗後卡住」：有顯示錯誤訊息，但按鈕一直停用
function stuckAfterFailure(): Component {
  return defineComponent({
    name: 'CheckoutButton',
    props: { submit: { type: Function, required: true } },
    setup(props) {
      const sending = ref(false)
      const error = ref(false)
      const done = ref(false)
      async function send() {
        if (sending.value) return
        sending.value = true
        try {
          await props.submit()
          done.value = true
          sending.value = false
        } catch {
          error.value = true   // 忘了把 sending 設回 false
        }
      }
      return () => done.value
        ? h('p', '已送出')
        : h('div', [
          h('button', { type: 'button', disabled: sending.value, onClick: send }, '送出訂單'),
          error.value ? h('p', { role: 'alert' }, '送出失敗') : null,
        ])
    },
  })
}

const WRONG: [string, Component][] = [
  ['可以連點（沒停用也沒擋重複）', variant({ guard: false, disable: false })],
  ['送出中按鈕沒有停用（有擋重複呼叫）', variant({ disable: false })],
  ['失敗後按鈕一直停用', stuckAfterFailure()],
  ['失敗了也顯示「已送出」', variant({ doneOnFail: true })],
  ['成功後沒有顯示「已送出」', variant({ showDone: false })],
  ['失敗訊息沒有 role="alert"', variant({ alertRole: false })],
  ['失敗後按鈕能按，但按了不會再送出', variant({ ignoreRetry: true })],
]

async function run(Component: Component) {
  try {
    await checkCheckoutButton(Component)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  }
}

describe('練習 1：結帳按鈕的檢查', () => {
  test('正確版本 A（CheckoutButton.vue）要通過', async () => {
    const error = await run(CheckoutButton)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}。檢查寫錯了，或等待不夠（成功、失敗之後要 await flushPromises()）`).toBeNull()
  })

  test('正確版本 B（內部寫法、class、文字細節都不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。B 沒有 submitting 變數、class 不同、送出中文字不變、成功後按鈕還在；只能依賴規格：<button>、disabled、「已送出」、role="alert"`).toBeNull()
  })

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Component) => {
    const error = await run(Component)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  })
})
