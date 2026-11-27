import { describe, expect, test } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ConfirmDialog from './ConfirmDialog.vue'

// 模擬訂單列表：開啟按鈕和對話框寫在同一個父元件裡
const Host = defineComponent({
  components: { ConfirmDialog },
  data: () => ({ open: false, confirmed: 0 }),
  template: `<div class="orders">
    <button type="button" class="opener" @click="open = true">刪除訂單</button>
    <ConfirmDialog v-model:open="open" title="確定刪除訂單？" @confirm="confirmed++">
      <p class="detail">訂單 #12 會被刪除</p>
    </ConfirmDialog>
  </div>`,
})

async function settle() {
  await nextTick()
  await nextTick()
}

async function openDialog() {
  // attachTo：放進真正的 document，focus() 才會改變 document.activeElement
  const wrapper = mount(Host, { attachTo: document.body })
  const opener = wrapper.get('.opener').element as HTMLButtonElement
  opener.focus()
  await wrapper.get('.opener').trigger('click')
  await settle()
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
  return { wrapper, opener, dialog }
}

// 在對話框裡的「確定」按鈕上按 Esc（事件會往上冒泡到對話框）
function pressEscape() {
  const target = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '確定') ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

const buttonText = (el: Element | null) => (el as HTMLElement | null)?.textContent?.trim()

describe('練習 3：ConfirmDialog 的 Teleport、ARIA 與焦點管理', () => {
  test('關著的時候不渲染；開啟後渲染到 <body> 底下，而不是父元件裡面', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    expect(document.querySelector('[role="dialog"], .dialog'), 'open 是 false 時不該有對話框').toBe(null)
    await wrapper.get('.opener').trigger('click')
    await settle()
    const dialog = document.querySelector('[role="dialog"]') ?? document.querySelector('.dialog')
    expect(dialog, '開啟後找不到對話框：open 為 true 時要渲染 .dialog').not.toBe(null)
    expect(wrapper.element.contains(dialog), '對話框還在父元件的 DOM 裡，會被 overflow: hidden 裁掉：用 <Teleport to="body"> 包起來').toBe(false)
    expect(document.body.contains(dialog) && dialog!.textContent!.includes('訂單 #12 會被刪除'), '預設 slot 的內容要出現在對話框裡').toBe(true)
  })

  test('對話框有 role="dialog"、aria-modal="true"，aria-labelledby 指向標題', async () => {
    const { dialog } = await openDialog()
    expect(dialog, '找不到 role="dialog" 的元素：螢幕報讀器靠它知道這是對話框').not.toBe(null)
    expect(dialog!.getAttribute('aria-modal'), '要加 aria-modal="true"：告訴螢幕報讀器對話框外的內容暫時不能操作').toBe('true')
    const id = dialog!.getAttribute('aria-labelledby')
    const title = id ? document.getElementById(id) : null
    expect(title?.textContent?.trim(), 'aria-labelledby 要指向顯示 title 的元素：用 useId() 產生 id，同時放在標題的 id 和對話框的 aria-labelledby').toBe('確定刪除訂單？')
  })

  test('開啟後，焦點在「確定」按鈕上', async () => {
    await openDialog()
    expect(buttonText(document.activeElement), '開啟後焦點不在「確定」按鈕：用 template ref 拿到按鈕，等 DOM 更新完（nextTick 或 flush: \'post\'）再 focus()').toBe('確定')
  })

  test('按 Esc 關閉，焦點回到開啟它的按鈕', async () => {
    const { wrapper, opener } = await openDialog()
    pressEscape()
    await settle()
    expect((wrapper.vm as any).open, '按 Esc 沒有關閉：在對話框元素上監聽 @keydown.esc，把 open 設成 false').toBe(false)
    expect(document.querySelector('[role="dialog"]'), '關閉後對話框要從畫面上移除').toBe(null)
    expect(document.activeElement === opener, '關閉後焦點沒有回到「刪除訂單」按鈕：開啟時記下 document.activeElement，關閉後呼叫它的 focus()').toBe(true)
  })

  test('按「確定」emit confirm 並關閉，焦點同樣回到原按鈕', async () => {
    const { wrapper, opener } = await openDialog()
    const confirmButton = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '確定')!
    confirmButton.click()
    await settle()
    expect((wrapper.vm as any).confirmed, '按「確定」要 emit(\'confirm\') 一次').toBe(1)
    expect((wrapper.vm as any).open, '按「確定」之後要關閉').toBe(false)
    expect(document.activeElement === opener, '用按鈕關閉時，焦點也要回到「刪除訂單」按鈕').toBe(true)
  })

  test('按「取消」只關閉、不 emit confirm，焦點回到原按鈕', async () => {
    const { wrapper, opener } = await openDialog()
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '取消')!
    cancel.click()
    await settle()
    expect((wrapper.vm as any).confirmed, '按「取消」不能 emit(\'confirm\')：取消只關閉').toBe(0)
    expect((wrapper.vm as any).open, '按「取消」之後要關閉').toBe(false)
    expect(document.activeElement === opener, '用「取消」關閉時，焦點也要回到「刪除訂單」按鈕').toBe(true)
  })

  test('焦點回到「開啟前有焦點的元素」，不是寫死某個按鈕', async () => {
    const Other = defineComponent({
      components: { ConfirmDialog },
      data: () => ({ open: false }),
      template: `<div>
        <input class="search" aria-label="搜尋訂單">
        <ConfirmDialog v-model:open="open" title="確定登出？" />
      </div>`,
    })
    const wrapper = mount(Other, { attachTo: document.body })
    const input = wrapper.get('.search').element as HTMLInputElement
    input.focus()
    ;(wrapper.vm as any).open = true   // 例如用快捷鍵開啟，焦點原本在搜尋框
    await settle()
    expect(buttonText(document.activeElement), '開啟後焦點要在「確定」').toBe('確定')
    pressEscape()
    await settle()
    expect(document.activeElement === input, '關閉後焦點要回到開啟前有焦點的元素（這裡是搜尋框）：開啟時記下 document.activeElement，不要寫死要聚焦哪個按鈕').toBe(true)
  })

  test('同一頁有兩個對話框時，aria-labelledby 的 id 不會重複', async () => {
    const Two = defineComponent({
      components: { ConfirmDialog },
      data: () => ({ a: true, b: true }),
      template: `<div>
        <ConfirmDialog v-model:open="a" title="確定刪除訂單？" />
        <ConfirmDialog v-model:open="b" title="確定退款？" />
      </div>`,
    })
    mount(Two, { attachTo: document.body })
    await settle()
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    expect(dialogs.length, '兩個對話框都開著時，body 裡要有兩個 role="dialog"').toBe(2)
    const titles = dialogs.map((d) => document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent?.trim())
    expect(titles, 'aria-labelledby 的 id 重複了，第二個對話框會念出第一個的標題：用 useId() 產生 id，不要寫死').toEqual(['確定刪除訂單？', '確定退款？'])
  })

  test('可以重複開關（第二次開啟也會聚焦、也能還原）', async () => {
    const { wrapper, opener } = await openDialog()
    pressEscape()
    await settle()
    opener.focus()
    await wrapper.get('.opener').trigger('click')
    await settle()
    expect(buttonText(document.activeElement), '第二次開啟時焦點也要在「確定」').toBe('確定')
    pressEscape()
    await settle()
    expect(document.activeElement === opener, '第二次關閉後焦點也要回到原按鈕').toBe(true)
  })
})
