import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DrinkForm, type Draft } from './DrinkForm.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const draft = (over: Partial<Draft> = {}): Draft =>
  deepFreeze({ productId: 2, quantity: '1', sweetness: 'normal', takeout: false, note: '', ...over })

function setup(initial = draft(), products: readonly Product[] = PRODUCTS) {
  const user = userEvent.setup()
  render(<DrinkForm products={products} initial={initial} />)
  return {
    user,
    product: screen.getByLabelText<HTMLSelectElement>('商品'),
    quantity: screen.getByLabelText<HTMLInputElement>('數量'),
    sweetness: (name: string) => screen.getByRole<HTMLInputElement>('radio', { name }),
    takeout: screen.getByLabelText<HTMLInputElement>('外帶'),
    note: screen.getByLabelText<HTMLTextAreaElement>('備註'),
    reset: screen.getByRole('button', { name: '重設' }),
    summary: () => screen.getByRole('status').textContent,
  }
}

describe('練習 1：DrinkForm 用一個 state 物件控制五種輸入', () => {
  test('一開始欄位與摘要都來自 initial', () => {
    const f = setup(draft({ productId: 5, quantity: '2', sweetness: 'none', takeout: true, note: '加熱' }))
    expect(f.product, '商品要選在 initial.productId（可頌）').toHaveValue('5')
    expect(f.quantity).toHaveValue(2)
    expect(f.sweetness('無糖')).toBeChecked()
    expect(f.takeout).toBeChecked()
    expect(f.note).toHaveValue('加熱')
    expect(f.summary(), '摘要要由 state 算出來，不能寫死').toBe('可頌 × 2，無糖，外帶，共 $140，備註：加熱')
  })

  test('換商品：摘要用新商品的名稱與價格', async () => {
    const f = setup()
    await f.user.selectOptions(f.product, '伯爵紅茶')
    expect(f.product).toHaveValue('4')
    expect(f.summary(), '<select> 的 e.target.value 是字串 "4"，products 裡的 id 是數字 4：存進 state 前先轉成數字，不然 find 找不到商品').toBe('伯爵紅茶 × 1，正常甜，內用，共 $90')
  })

  test('商品名稱與價格從 props 的 products 讀', async () => {
    const f = setup(draft({ productId: 9 }), [
      { id: 8, name: '抹茶拿鐵', price: 150, category: 'tea' },
      { id: 9, name: '熱可可', price: 95, category: 'tea' },
    ])
    expect(f.summary(), '不能寫死咖啡店的菜單：用 props 的 products').toBe('熱可可 × 1，正常甜，內用，共 $95')
    await f.user.selectOptions(f.product, '抹茶拿鐵')
    expect(f.summary()).toBe('抹茶拿鐵 × 1，正常甜，內用，共 $150')
  })

  test('數量：輸入框顯示使用者打的字，金額用數字計算', async () => {
    const f = setup()
    await f.user.clear(f.quantity)
    expect(f.quantity, '清空之後輸入框要是空的：state 存字串，不要存 Number(e.target.value)（Number("") 是 0，輸入框會跳出一個 0）').toHaveValue(null)
    expect(f.summary(), '數量清空時，摘要要顯示「數量要是 1～20 的整數」').toBe('數量要是 1～20 的整數')
    await f.user.type(f.quantity, '3')
    expect(f.quantity).toHaveValue(3)
    expect(f.summary()).toBe('拿鐵 × 3，正常甜，內用，共 $330')
  })

  test('數量不是 1～20 的整數時，摘要改成提示', async () => {
    const f = setup()
    for (const [typed, expected] of [
      ['0', '數量要是 1～20 的整數'],
      ['21', '數量要是 1～20 的整數'],
      ['2.5', '數量要是 1～20 的整數'],
      ['20', '拿鐵 × 20，正常甜，內用，共 $2200'],
    ]) {
      await f.user.clear(f.quantity)
      await f.user.type(f.quantity, typed)
      expect(f.summary(), `數量輸入 ${typed} 時的摘要不對`).toBe(expected)
    }
  })

  test('甜度（radio）：同一時間只有一個被選', async () => {
    const f = setup()
    await f.user.click(f.sweetness('半糖'))
    expect(f.sweetness('半糖'), '每個 radio 的 checked 要是「state 的甜度 === 這個選項的 value」').toBeChecked()
    expect(f.sweetness('正常甜')).not.toBeChecked()
    expect(f.summary()).toBe('拿鐵 × 1，半糖，內用，共 $110')
    await f.user.click(f.sweetness('無糖'))
    expect(f.summary()).toBe('拿鐵 × 1，無糖，內用，共 $110')
  })

  test('外帶（checkbox）：勾選與取消', async () => {
    const f = setup()
    await f.user.click(f.takeout)
    expect(f.takeout).toBeChecked()
    expect(f.summary()).toBe('拿鐵 × 1，正常甜，外帶，共 $110')
    await f.user.click(f.takeout)
    expect(f.takeout, 'checkbox 要讀 e.target.checked（布林），不是 e.target.value（永遠是 "on"）').not.toBeChecked()
    expect(f.summary(), '取消勾選後要變回「內用」：checkbox 要讀 e.target.checked，不是 e.target.value').toBe('拿鐵 × 1，正常甜，內用，共 $110')
  })

  test('備註（textarea）：去掉頭尾空白後不是空的才加進摘要', async () => {
    const f = setup()
    await f.user.type(f.note, '   ')
    expect(f.summary(), '備註只有空白時不加進摘要').toBe('拿鐵 × 1，正常甜，內用，共 $110')
    await f.user.type(f.note, '少冰 ')
    expect(f.note, '輸入框要顯示使用者打的原文（含空白），trim 只用在摘要').toHaveValue('   少冰 ')
    expect(f.summary()).toBe('拿鐵 × 1，正常甜，內用，共 $110，備註：少冰')
  })

  test('連續改好幾個欄位，前面改的不能不見', async () => {
    const f = setup()
    await f.user.selectOptions(f.product, '起司蛋糕')
    await f.user.clear(f.quantity)
    await f.user.type(f.quantity, '2')
    await f.user.click(f.sweetness('半糖'))
    await f.user.click(f.takeout)
    await f.user.type(f.note, '附叉子')
    expect(f.summary(), '更新一個欄位時要保留其他欄位：setDraft(d => ({ ...d, [key]: value }))').toBe('起司蛋糕 × 2，半糖，外帶，共 $240，備註：附叉子')
  })

  test('按「重設」：欄位與摘要都回到 initial', async () => {
    const f = setup()
    await f.user.selectOptions(f.product, '起司蛋糕')
    await f.user.clear(f.quantity)
    await f.user.type(f.quantity, '7')
    await f.user.click(f.sweetness('無糖'))
    await f.user.click(f.takeout)
    await f.user.type(f.note, '附叉子')
    await f.user.click(f.reset)
    const hint = '受控的欄位才會跟著 state 回到初始值：每個欄位都要有 value（或 checked）與 onChange'
    expect(f.product, hint).toHaveValue('2')
    expect(f.quantity, hint).toHaveValue(1)
    expect(f.sweetness('正常甜'), hint).toBeChecked()
    expect(f.takeout, hint).not.toBeChecked()
    expect(f.note, hint).toHaveValue('')
    expect(f.summary()).toBe('拿鐵 × 1，正常甜，內用，共 $110')
  })
})
