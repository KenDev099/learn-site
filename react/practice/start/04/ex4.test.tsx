import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductSearch } from './ProductSearch.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'

const ALL = PRODUCTS.map(p => p.name)

function setup() {
  const user = userEvent.setup()
  const onPick = vi.fn<(p: Product) => void>()
  render(<ProductSearch products={PRODUCTS} onPick={onPick} />)
  const input = screen.getByLabelText<HTMLInputElement>('搜尋商品')
  return {
    user, onPick, input,
    names: () => screen.queryAllByRole('listitem').map(li => li.textContent),
    // 模擬瀏覽器在輸入法組字時送出的事件（順序依 UI Events 規格）：
    // compositionstart →（input，isComposing: true）× 每個符號 → compositionend
    startComposition: () => fireEvent.compositionStart(input),
    compose: (value: string) => fireEvent.input(input, { target: { value }, isComposing: true, inputType: 'insertCompositionText' }),
    endComposition: (data: string) => fireEvent.compositionEnd(input, { data }),
    enter: (composing = false) => fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: composing, keyCode: composing ? 229 : 13 }),
  }
}

describe('練習 4：ProductSearch 處理中文輸入法的組字', () => {
  test('不是輸入法的輸入：每次輸入都更新清單', async () => {
    const f = setup()
    expect(f.names(), '關鍵字是空的時顯示全部商品').toEqual(ALL)
    await f.user.type(f.input, '茶')
    expect(f.names()).toEqual(['伯爵紅茶'])
    await f.user.clear(f.input)
    await f.user.type(f.input, 'latte')
    expect(f.names()).toEqual([])
    expect(screen.getByText('找不到商品')).toBeInTheDocument()
  })

  test('組字中：輸入框照常顯示，清單維持組字前的結果', () => {
    const f = setup()
    f.startComposition()
    for (const typed of ['ㄋ', 'ㄋㄚ', 'ㄋㄚˊ']) {
      f.compose(typed)
      expect(f.input, '組字中的符號要照常顯示在輸入框：onChange 裡每次都要更新輸入框的 state，不能因為在組字就跳過（React 會把輸入框改回舊的值，組字被打斷）').toHaveValue(typed)
      expect(f.names(), `組字中（輸入框是「${typed}」）不能拿去篩選：清單要維持全部商品。把「輸入框的字」和「拿去篩選的關鍵字」分成兩個 state`).toEqual(ALL)
      expect(screen.queryByText('找不到商品'), '組字中不該閃出「找不到商品」').not.toBeInTheDocument()
    }
  })

  test('組字結束：關鍵字更新成選好的字', () => {
    const f = setup()
    f.startComposition()
    f.compose('ㄋㄚˊ')
    f.compose('拿')             // 選字：最後一次 input 事件，isComposing 還是 true
    f.endComposition('拿')      // 之後才是 compositionend，後面不會再有 input 事件
    expect(f.input).toHaveValue('拿')
    expect(f.names(), '組字結束後清單沒有更新：最後一次 input 的 isComposing 還是 true，只靠 onChange 會漏掉。在 onCompositionEnd 用 e.currentTarget.value 更新關鍵字').toEqual(['拿鐵'])
  })

  test('組字結束後繼續打字、再組一次字', async () => {
    const f = setup()
    f.startComposition()
    f.compose('紅')
    f.endComposition('紅')
    expect(f.names()).toEqual(['伯爵紅茶'])
    f.startComposition()
    f.compose('紅ㄔ')
    expect(f.names(), '第二次組字中，清單維持上一次的結果').toEqual(['伯爵紅茶'])
    f.compose('紅茶')
    f.endComposition('茶')      // compositionend 的 data 只有這次組出來的字，不是整個輸入框
    expect(f.names(), '關鍵字要用輸入框的完整內容（e.currentTarget.value），不是 compositionend 事件的 data').toEqual(['伯爵紅茶'])
    await f.user.type(f.input, '包')
    expect(f.input).toHaveValue('紅茶包')
    expect(f.names(), '組字結束後，一般的輸入要照常更新清單').toEqual([])
  })

  test('按 Enter 選第一筆；組字中的 Enter 不算', () => {
    const f = setup()
    f.startComposition()
    f.compose('ㄎㄚ')
    f.enter(true)               // 選字時按的 Enter：keydown 的 isComposing 是 true
    expect(f.onPick, '組字中按的 Enter 是在選字，不能呼叫 onPick：檢查 e.nativeEvent.isComposing').not.toHaveBeenCalled()
    f.compose('卡')
    f.endComposition('卡')
    expect(f.names()).toEqual(['卡布奇諾'])
    f.enter()
    expect(f.onPick.mock.calls, '組字結束後按 Enter，要呼叫 onPick(清單的第一筆)').toEqual([[PRODUCTS[2]]])
  })

  test('清單是空的時按 Enter 不呼叫 onPick', async () => {
    const f = setup()
    await f.user.type(f.input, '珍珠奶茶')
    f.enter()
    expect(f.onPick, '沒有符合的商品時，Enter 不能呼叫 onPick').not.toHaveBeenCalled()
  })
})
