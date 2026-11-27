import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { CartSummary } from './CartSummary.tsx'

// 畫面上每個 <p> 的文字，以及整個元件的文字（多出來的「0」不在任何 <p> 裡，但會出現在整體文字中）
function show(ui: ReactElement) {
  const { container, unmount } = render(ui)
  const lines = [...container.querySelectorAll('p')].map(p => p.textContent)
  const text = container.textContent
  unmount()
  return { lines, text }
}

describe('練習 3：CartSummary 的條件渲染', () => {
  test('count 是 0：只顯示「購物車是空的」，畫面上不能出現 0', () => {
    const { lines, text } = show(<CartSummary count={0} total={0} />)
    expect(lines, 'count 是 0 時只能有一個 <p>購物車是空的</p>：在最前面判斷後提早 return').toEqual(['購物車是空的'])
    expect(text, '畫面上多了別的文字。{count && …} 在 count 是 0 時會 render 出「0」：&& 的左邊要是布林值').toBe('購物車是空的')
  })

  test('有商品、沒傳 discount、不滿 500：件數、合計、差多少免運', () => {
    const { lines, text } = show(<CartSummary count={2} total={190} />)
    expect(lines).toEqual(['共 2 件', '合計 $190', '再買 $310 免運'])
    expect(text, '<p> 以外不能有多餘的文字').toBe('共 2 件合計 $190再買 $310 免運')
  })

  test('discount 是 0：沒有折扣那一行，也不能多出「0」', () => {
    const { lines, text } = show(<CartSummary count={1} total={110} discount={0} />)
    expect(lines, 'discount 是 0 時不能有「折扣」這一行').toEqual(['共 1 件', '合計 $110', '再買 $390 免運'])
    expect(text, '畫面上多了別的文字。{discount && …} 在 discount 是 0 時會 render 出「0」：改成 discount > 0 && …').toBe('共 1 件合計 $110再買 $390 免運')
  })

  test('discount 大於 0：折扣那一行在件數和合計中間', () => {
    const { lines } = show(<CartSummary count={3} total={270} discount={30} />)
    expect(lines).toEqual(['共 3 件', '折扣 -$30', '合計 $270', '再買 $230 免運'])
  })

  test('免運門檻是 500（含）：499 還差 1 元，500 和 800 免運', () => {
    expect(show(<CartSummary count={5} total={499} />).lines.at(-1), 'total 499：最後一行是「再買 $1 免運」').toBe('再買 $1 免運')
    expect(show(<CartSummary count={5} total={500} />).lines.at(-1), 'total 剛好 500 就免運：用 >=').toBe('免運')
    expect(show(<CartSummary count={8} total={800} />).lines, 'total 800：免運，而且不能同時出現「再買…」').toEqual(['共 8 件', '合計 $800', '免運'])
  })
})
