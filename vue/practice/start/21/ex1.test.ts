import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ErrorBoundary from './ErrorBoundary.vue'

// 菜單元件：state.fail 為 true 時在 setup 丟錯；setups 記錄 setup 跑了幾次
function makeMenu() {
  const state = { fail: true, setups: 0 }
  const Menu = defineComponent({
    name: 'Menu',
    setup() {
      state.setups++
      if (state.fail) throw new Error('菜單載入失敗')
      return () => h('p', { class: 'menu' }, '今日菜單')
    },
  })
  return { Menu, state }
}

const withFallback = `<ErrorBoundary :report="report">
  <Child />
  <template #fallback="{ error, retry }">
    <p class="fb">出錯了：{{ error.message }}</p>
    <button type="button" class="retry" @click="retry">再試一次</button>
  </template>
</ErrorBoundary>`

// 錯誤發生在第一次渲染當中，替代畫面要等下一次更新才出現，所以掛載後要等一下
async function mountIn(Child: object, template = withFallback) {
  const report = vi.fn()
  const errorHandler = vi.fn()
  const wrapper = mount(
    { components: { ErrorBoundary, Child }, template, setup: () => ({ report }) },
    // setup 丟錯的元件沒有 render，Vue 會警告 missing template；這裡不印出來
    { global: { config: { errorHandler, warnHandler: () => {} } } },
  )
  await flushPromises()
  return { wrapper, report, errorHandler }
}

describe('練習 1：可以重試的錯誤邊界', () => {
  test('子元件 setup 丟錯：顯示 #fallback，拿到 error', async () => {
    const { Menu } = makeMenu()
    const { wrapper } = await mountIn(Menu)
    expect(wrapper.find('.fb').exists(), '子元件出錯時要顯示 #fallback slot：用 onErrorCaptured 把錯誤存進 ref，範本用 v-if 切換').toBe(true)
    expect(wrapper.find('.fb').text(), '#fallback 的 slot props 要有 error（Error 物件）').toBe('出錯了：菜單載入失敗')
    expect(wrapper.find('.menu').exists(), '有錯誤時不能渲染出錯的子元件').toBe(false)
  })

  test('report 收到原本的錯誤與 info 一次；回傳 false，app 的 errorHandler 收不到', async () => {
    const { Menu } = makeMenu()
    const { report, errorHandler } = await mountIn(Menu)
    expect(report, '每個錯誤要呼叫一次 props.report(錯誤, info)').toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(report.mock.calls[0][0].message).toBe('菜單載入失敗')
    expect(report.mock.calls[0][1], 'report 的第二個參數是 onErrorCaptured 收到的 info').toBe('setup function')
    expect(errorHandler, 'onErrorCaptured 要回傳 false，錯誤才不會再傳到 app.config.errorHandler（否則同一個錯誤會回報兩次）').not.toHaveBeenCalled()
  })

  test('修好之後按重試：子元件重新 setup、顯示內容', async () => {
    const { Menu, state } = makeMenu()
    const { wrapper } = await mountIn(Menu)
    state.fail = false
    await wrapper.find('.retry').trigger('click')
    expect(wrapper.find('.fb').exists(), 'retry() 要把錯誤清掉，替代畫面才會消失').toBe(false)
    expect(state.setups, '重試時子元件要重新建立（setup 再跑一次）：用 v-if／v-else 切換 slot，不要用 v-show 保留舊的子元件').toBe(2)
    expect(wrapper.find('.menu').text(), '重試成功後要顯示子元件的內容').toBe('今日菜單')
  })

  test('重試後又失敗：再次顯示替代畫面並再回報一次', async () => {
    const { Menu } = makeMenu()
    const { wrapper, report } = await mountIn(Menu)
    await wrapper.find('.retry').trigger('click')
    expect(wrapper.find('.fb').exists(), '重試又失敗時要回到替代畫面').toBe(true)
    expect(report, '重試又失敗是新的一次錯誤，要再回報').toHaveBeenCalledTimes(2)
  })

  test('async 點擊處理在 await 之後丟錯，也會被攔下', async () => {
    const Pay = defineComponent({
      name: 'Pay',
      setup() {
        async function pay() {
          await Promise.resolve()
          throw new Error('付款失敗')
        }
        return () => h('button', { class: 'pay', onClick: pay }, '付款')
      },
    })
    const { wrapper, report, errorHandler } = await mountIn(Pay)
    await wrapper.find('.pay').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fb').text(), '事件處理函式（包括 async 的）丟出的錯誤也會傳到 onErrorCaptured').toBe('出錯了：付款失敗')
    expect(report.mock.calls[0]?.[1], 'Vue 會等事件處理函式回傳的 Promise，info 是 native event handler').toBe('native event handler')
    expect(errorHandler).not.toHaveBeenCalled()
  })

  test('丟出的不是 Error：error 要包成 Error，report 收到原本的值', async () => {
    const Bad = defineComponent({
      name: 'Bad',
      setup() {
        throw '庫存服務沒有回應'
      },
    })
    const { wrapper, report } = await mountIn(Bad)
    expect(wrapper.find('.fb').text(), '丟出的值不是 Error 時，用 new Error(String(值)) 包起來再給 #fallback').toBe('出錯了：庫存服務沒有回應')
    expect(report.mock.calls[0]?.[0], 'report 要收到原本丟出的值').toBe('庫存服務沒有回應')
  })

  test('沒有傳 #fallback：顯示 role="alert" 的後備內容，重試按鈕可以用', async () => {
    const { Menu, state } = makeMenu()
    const { wrapper } = await mountIn(Menu, '<ErrorBoundary :report="report"><Child /></ErrorBoundary>')
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists() && alert.text().includes('這個區塊暫時無法顯示'), '沒有傳 #fallback 時，要顯示 role="alert" 的「這個區塊暫時無法顯示」（寫在 <slot name="fallback"> 裡當後備內容）').toBe(true)
    const button = wrapper.findAll('button').find((b) => b.text().includes('重試'))
    expect(button, '後備內容要有「重試」按鈕').toBeTruthy()
    state.fail = false
    await button!.trigger('click')
    expect(wrapper.find('.menu').text(), '後備內容的重試按鈕要呼叫 retry').toBe('今日菜單')
  })

  test('沒有錯誤時只顯示子元件', async () => {
    const { Menu, state } = makeMenu()
    state.fail = false
    const { wrapper, report } = await mountIn(Menu)
    expect(wrapper.find('.menu').text()).toBe('今日菜單')
    expect(wrapper.find('.fb').exists()).toBe(false)
    expect(report).not.toHaveBeenCalled()
  })
})
