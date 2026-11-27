import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { format } from 'node:util'
import { OrderTable, type OrderLine } from './OrderTable.tsx'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 凍結的訂單明細：元件只要改了它就會丟 TypeError
const LINES: readonly OrderLine[] = deepFreeze([
  { productId: 2, name: '拿鐵', price: 110, quantity: 2, note: '少冰' },
  { productId: 5, name: '可頌', price: 70, quantity: 1 },
  { productId: 6, name: '起司蛋糕', price: 120, quantity: 3, note: '' },
  { productId: 1, name: '美式咖啡', price: 80, quantity: 1, note: '外帶' },
])
const tbody = (container: HTMLElement) => container.querySelector('tbody')!
// 每一列的文字：儲存格之間用「 | 」隔開
const rows = (container: HTMLElement) => [...tbody(container).querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent).join(' | '))
const rowOf = (name: string) => screen.getByRole('rowheader', { name }).closest('tr')

// React 的警告用 console.error 印出，而且同一種警告只印第一次，所以這個檢查一定要是檔案裡第一個測試
function reactWarnings(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  run()
  return spy.mock.calls.map(args => format(...args).split('\n')[0])
}

describe('練習 5：OrderTable 用 Fragment 一次回傳兩列', () => {
  test('render 時 React 沒有印出警告', () => {
    const warnings = reactWarnings(() => { render(<OrderTable lines={LINES} />) })
    expect(warnings, 'React 印出了警告。「<div> cannot be a child of <tbody>」：不能用 <div> 包，改用 Fragment；「Each child in a list should have a unique "key" prop」：map 回傳的最外層要有 key，<>…</> 不能寫 key，要用 <Fragment key={…}>').toEqual([])
  })

  test('<tbody> 的直接子元素只有 <tr>', () => {
    const { container } = render(<OrderTable lines={LINES} />)
    expect([...new Set([...tbody(container).children].map(el => el.localName))], '<tbody> 裡不能多包一層元素：Fragment 不會產生 DOM 節點').toEqual(['tr'])
  })

  test('有備註的品項多一列備註，小計是 price × quantity', () => {
    const { container } = render(<OrderTable lines={LINES} />)
    expect(rows(container), '4 個品項、2 個有備註，<tbody> 要有 6 列：note 是空字串或沒有 note 的品項不能有備註列；小計是 price × quantity').toEqual([
      '拿鐵 | 2 | $220',
      '備註：少冰',
      '可頌 | 1 | $70',
      '起司蛋糕 | 3 | $360',
      '美式咖啡 | 1 | $80',
      '備註：外帶',
    ])
    expect(tbody(container).textContent, '<tr> 以外不能有多餘的文字').toBe('拿鐵2$220備註：少冰可頌1$70起司蛋糕3$360美式咖啡1$80備註：外帶')
    const note = tbody(container).querySelector('tr.note > td')
    expect(note?.getAttribute('colspan'), '備註列是 <tr className="note">，裡面一個橫跨三欄的 <td colSpan={3}>').toBe('3')
  })

  test('換一份訂單：不能寫死；沒有品項時 <tbody> 是空的', () => {
    const { container, rerender } = render(<OrderTable lines={deepFreeze([{ productId: 4, name: '伯爵紅茶', price: 90, quantity: 4, note: '去糖' }])} />)
    expect(rows(container)).toEqual(['伯爵紅茶 | 4 | $360', '備註：去糖'])
    rerender(<OrderTable lines={deepFreeze([])} />)
    expect(rows(container), 'lines 是空陣列時 <tbody> 裡沒有任何列').toEqual([])
  })

  test('順序反過來：原本的 <tr> 跟著品項移動（key 用 productId）', () => {
    const { container, rerender } = render(<OrderTable lines={LINES} />)
    const before = LINES.map(l => rowOf(l.name))
    rerender(<OrderTable lines={deepFreeze(LINES.toReversed())} />)
    expect(rows(container)).toEqual([
      '美式咖啡 | 1 | $80',
      '備註：外帶',
      '起司蛋糕 | 3 | $360',
      '可頌 | 1 | $70',
      '拿鐵 | 2 | $220',
      '備註：少冰',
    ])
    expect(LINES.map((l, i) => rowOf(l.name) === before[i]), '每個品項的 <tr> 都要是原本那一個 DOM 節點：key 用陣列位置（或沒寫 key）時，React 依位置重用節點，只是把文字換掉。寫 <Fragment key={line.productId}>').toEqual(LINES.map(() => true))
  })
})
