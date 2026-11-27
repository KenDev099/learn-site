import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog.tsx'

const onRowClick = vi.fn<(id: number) => void>()
const onConfirm = vi.fn<(id: number) => void>()
const onClose = vi.fn<() => void>()
beforeEach(() => { onRowClick.mockClear(); onConfirm.mockClear(); onClose.mockClear() })

// 訂單列表：每一列（<li onClick>）裡有一個「刪除訂單」按鈕和它的確認對話框
function Orders() {
  const [openId, setOpenId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  return (
    <ul>
      {[12, 13].map(id => (
        <li key={id} onClick={() => onRowClick(id)}>
          <button type="button" onClick={e => { e.stopPropagation(); setOpenId(id) }}>刪除訂單 #{id}</button>
          <ConfirmDialog
            open={openId === id}
            title={`刪除訂單 #${id}？`}
            onConfirm={() => { onConfirm(id); setOpenId(null) }}
            onClose={() => { onClose(); setOpenId(null) }}
          >
            <label>原因 <input value={reason} onChange={e => setReason(e.target.value)} /></label>
          </ConfirmDialog>
        </li>
      ))}
    </ul>
  )
}

async function open(id = 12) {
  const user = userEvent.setup()
  const view = render(<Orders />)
  const opener = screen.getByRole('button', { name: `刪除訂單 #${id}` })
  await user.click(opener)
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!dialog) throw new Error('按了「刪除訂單」之後，document 裡找不到 role="dialog" 的元素：對話框元素要加 role="dialog"')
  return { user, opener, dialog, ...view }
}

describe('練習 1：ConfirmDialog 用 Portal 畫到 body，管好焦點與 Esc', () => {
  test('關閉時什麼都不畫；開啟後畫在 document.body 底下，不在 <li> 裡', async () => {
    const user = userEvent.setup()
    const { container: list } = render(<Orders />)
    expect(document.querySelector('[role="dialog"]'), 'open 是 false 時不能畫出對話框（用 hidden 藏起來也不行，直接回傳 null）').toBeNull()
    expect(document.querySelector('h2'), 'open 是 false 時不能畫出對話框的內容').toBeNull()
    await user.click(screen.getByRole('button', { name: '刪除訂單 #12' }))
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    if (!dialog) throw new Error('按了「刪除訂單」之後，document 裡找不到 role="dialog" 的元素：對話框元素要加 role="dialog"')
    expect(list.contains(dialog), '對話框還在 <li> 裡面，會被列表的 overflow 裁掉：用 createPortal(內容, document.body) 把它畫到 body 底下').toBe(false)
    expect(document.body.contains(dialog), '對話框要畫到 document.body 底下').toBe(true)
  })

  test('有 role="dialog"、aria-modal="true"，名稱來自 aria-labelledby 指到的標題', async () => {
    const { dialog } = await open(13)
    expect(dialog, '對話框元素要有 aria-modal="true"').toHaveAttribute('aria-modal', 'true')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId, '對話框元素要有 aria-labelledby，值是標題元素的 id').toBeTruthy()
    const label = document.getElementById(labelId!)
    expect(label && dialog.contains(label), 'aria-labelledby 指到的元素要在對話框裡面').toBe(true)
    expect(label, 'aria-labelledby 指到的元素要顯示 title').toHaveTextContent('刪除訂單 #13？')
    expect(screen.getByRole('dialog', { name: '刪除訂單 #13？' })).toBe(dialog)
  })

  test('同一頁有兩個對話框時，標題的 id 不重複', () => {
    render(<>
      <ConfirmDialog open title="刪除訂單 #12？" onConfirm={() => {}} onClose={() => {}} />
      <ConfirmDialog open title="清空購物車？" onConfirm={() => {}} onClose={() => {}} />
    </>)
    const ids = [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-labelledby'))
    expect(new Set(ids).size, `兩個對話框的 aria-labelledby 都是 ${ids[0]}，id 重複了：用 useId() 產生，不要寫死`).toBe(2)
    expect(screen.getByRole('dialog', { name: '清空購物車？' }), '第二個對話框的名稱要是自己的 title').toBeInTheDocument()
  })

  test('開啟後焦點在「確定」', async () => {
    const { dialog } = await open()
    expect(document.activeElement, '開啟後焦點要移到「確定」：在 effect 裡對按鈕的 ref 呼叫 focus()（render 的時候按鈕還不在 DOM 裡）')
      .toBe(within(dialog).getByRole('button', { name: '確定' }))
  })

  test('「取消」呼叫 onClose，「確定」呼叫 onConfirm', async () => {
    const first = await open(12)
    await first.user.click(within(first.dialog).getByRole('button', { name: '取消' }))
    expect(onClose, '按「取消」要呼叫 onClose 一次').toHaveBeenCalledTimes(1)
    expect(onConfirm, '按「取消」不能呼叫 onConfirm').not.toHaveBeenCalled()
    first.unmount()
    const second = await open(13)
    await second.user.click(within(second.dialog).getByRole('button', { name: '確定' }))
    expect(onConfirm.mock.calls, '按「確定」要呼叫 onConfirm 一次').toEqual([[13]])
    expect(document.querySelector('[role="dialog"]'), '父元件把 open 改成 false 之後，對話框要從 document 消失').toBeNull()
  })

  test('按 Esc 呼叫 onClose；對話框沒開的時候按 Esc 不呼叫', async () => {
    const user = userEvent.setup()
    render(<Orders />)
    await user.keyboard('{Escape}')
    expect(onClose, '對話框還沒開，按 Esc 不能呼叫 onClose').not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '刪除訂單 #12' }))
    await user.keyboard('{Escape}')
    expect(onClose, '焦點在對話框裡時按 Esc 要呼叫 onClose 一次：在對話框元素上寫 onKeyDown，檢查 e.key === \'Escape\'').toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]'), '按 Esc 之後對話框要關閉').toBeNull()
    await user.keyboard('{Escape}')
    expect(onClose, '對話框關閉之後再按 Esc，onClose 又被呼叫了：監聽註冊在 document 上的話，關閉時要在清理函式裡移除').toHaveBeenCalledTimes(1)
  })

  test.each([
    ['取消', 12], ['確定', 13],
  ] as const)('按「%s」關閉後，焦點回到開啟它的按鈕', async (name, id) => {
    const { user, opener, dialog } = await open(id)
    await user.click(within(dialog).getByRole('button', { name }))
    expect(document.activeElement, `關閉後焦點要回到「刪除訂單 #${id}」：開啟時在 effect 裡記下 document.activeElement，在清理函式裡呼叫它的 focus()`).toBe(opener)
  })

  test('按 Esc 關閉後，焦點也回到開啟它的按鈕', async () => {
    const { user, opener } = await open(13)
    await user.keyboard('{Escape}')
    expect(document.activeElement, '用 Esc 關閉後焦點要回到「刪除訂單 #13」').toBe(opener)
  })

  test('在對話框裡點擊，不會觸發祖先 <li> 的 onClick', async () => {
    const { user, dialog } = await open()
    await user.click(within(dialog).getByRole('heading'))
    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(onRowClick, 'Portal 裡的事件會沿 React 樹冒泡：點對話框時 <li> 的 onClick 被呼叫了。在對話框元素的 onClick 裡 stopPropagation()').not.toHaveBeenCalled()
  })

  test('在對話框裡的輸入框打字時，焦點不會被搶走', async () => {
    const { user, dialog } = await open()
    const input = within(dialog).getByLabelText('原因')
    await user.type(input, '做錯了')
    expect(input, '在對話框裡打字，字沒有全部進到輸入框：父元件每次重新 render 你的 effect 都重跑、把焦點搶回「確定」。effect 的依賴陣列只放 open').toHaveValue('做錯了')
    expect(document.activeElement, '打字之後焦點要留在輸入框').toBe(input)
  })
})
