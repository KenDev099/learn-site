import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartList, type CartItem } from './CartList.tsx'

const ITEMS: CartItem[] = [
  { id: 2, name: '拿鐵', quantity: 1 },
  { id: 3, name: '卡布奇諾', quantity: 2 },
  { id: 5, name: '可頌', quantity: 1 },
]

function setup(items = ITEMS) {
  render(<CartList initialItems={items.map(i => ({ ...i }))} />)
  return userEvent.setup()
}

describe('練習 3：移除商品的按鈕名稱、狀態訊息與焦點', () => {
  test('移除按鈕的名稱是「移除品名」，畫面上顯示 ✕', () => {
    setup()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.textContent?.trim()), '畫面上仍然只顯示 ✕').toEqual(['✕', '✕', '✕'])
    expect(buttons[0], '只有 ✕ 的按鈕，讀螢幕軟體唸不出要移除什麼：用 aria-label').toHaveAccessibleName('移除拿鐵')
    expect(buttons[1]).toHaveAccessibleName('移除卡布奇諾')
    expect(buttons[2]).toHaveAccessibleName('移除可頌')
  })

  test('狀態區一開始就存在，移除後唸出「已移除品名」', async () => {
    const user = setup()
    const status = screen.queryByRole('status')
    expect(status, '<p role="status"> 要一開始就在畫面上（內容空的），讀螢幕軟體才會監聽它的變化').not.toBeNull()
    expect(status).toHaveTextContent('')
    await user.click(screen.getByRole('button', { name: '移除卡布奇諾' }))
    expect(screen.getByRole('status'), '同一個狀態區換內容，不要換成新的元素').toBe(status)
    expect(status).toHaveTextContent('已移除卡布奇諾')
  })

  test('移除中間那列：焦點移到下一列的移除按鈕', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '移除卡布奇諾' }))
    expect(screen.queryByRole('button', { name: '移除卡布奇諾' })).toBeNull()
    expect(screen.getByRole('button', { name: '移除可頌' }), '被移除的按鈕消失後焦點會掉回 body；要移到下一列的移除按鈕').toHaveFocus()
  })

  test('移除最後一列：焦點移到上一列的移除按鈕', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '移除可頌' }))
    expect(screen.getByRole('button', { name: '移除卡布奇諾' }), '沒有下一列時移到上一列').toHaveFocus()
  })

  test('用鍵盤連續移除到空：焦點最後移到標題', async () => {
    const user = setup()
    screen.getByRole('button', { name: '移除拿鐵' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '移除卡布奇諾' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '移除可頌' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('購物車是空的')).toBeInTheDocument()
    const title = screen.getByRole('heading', { name: '購物車' })
    expect(title, '購物車空了，焦點移到「購物車」標題').toHaveFocus()
    expect(title, '標題要 tabIndex={-1} 才能被程式聚焦').toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('status')).toHaveTextContent('已移除可頌')
  })
})
