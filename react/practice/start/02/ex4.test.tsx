import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { format } from 'node:util'
import { MenuList } from './MenuList.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 凍結的陣列：元件只要改了它（排序、push、改屬性）就會丟 TypeError
const frozen = (list: readonly Product[]) => deepFreeze(structuredClone(list)) as readonly Product[]
const names = () => screen.getAllByRole('listitem').map(li => li.querySelector('span')?.textContent)
const rowOf = (name: string) => screen.getByLabelText(`${name} 的備註`).closest('li')

// React 的警告用 console.error 印出，而且同一種警告只印第一次，所以這個檢查一定要是檔案裡第一個測試
function reactWarnings(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  run()
  return spy.mock.calls.map(args => format(...args).split('\n')[0])
}

describe('練習 4：MenuList 用 map 產生列表，key 用商品 id', () => {
  test('render 時 React 沒有印出警告（包括兩個同名、不同 id 的商品）', () => {
    const sameName = frozen([PRODUCTS[1], { id: 7, name: '拿鐵', price: 130, category: 'coffee' }])
    const warnings = reactWarnings(() => {
      render(<MenuList products={frozen(PRODUCTS)} onAdd={() => {}} />)
      render(<MenuList products={sameName} onAdd={() => {}} />)
    })
    expect(warnings, 'React 印出了警告。「Each child in a list should have a unique "key" prop」：map 回傳的最外層元素要有 key；「two children with the same key」：key 重複了，要用商品 id，不要用名稱').toEqual([])
  })

  test('每個商品一個 <li>，順序跟陣列一樣，顯示名稱與價格', () => {
    render(<MenuList products={frozen(PRODUCTS)} onAdd={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items.length, '6 個商品要有 6 個 <li>：用 products.map(…)').toBe(6)
    expect(items.map(li => [...li.querySelectorAll('span')].map(s => s.textContent).join(' ')), '每一列是 <span>名稱</span> <span>$價格</span>，順序跟 products 一樣').toEqual(PRODUCTS.map(p => `${p.name} $${p.price}`))
    for (const p of PRODUCTS) {
      expect(within(rowOf(p.name)!).getByRole('button', { name: `加入${p.name}` }), `「${p.name}」那一列要有備註輸入框（aria-label 是「${p.name} 的備註」）和「加入${p.name}」按鈕`).toBeInTheDocument()
    }
  })

  test('換一份菜單：不能寫死', () => {
    render(<MenuList products={frozen([PRODUCTS[5], PRODUCTS[3]])} onAdd={() => {}} />)
    expect(names(), '只傳起司蛋糕、伯爵紅茶兩個商品').toEqual(['起司蛋糕', '伯爵紅茶'])
  })

  test('按「加入可頌」呼叫 onAdd(5)：參數是商品 id，不是陣列位置', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<MenuList products={frozen(PRODUCTS)} onAdd={onAdd} />)
    expect(onAdd, 'render 的時候不能呼叫 onAdd：onClick 要傳函式').not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '加入可頌' }))
    await user.click(screen.getByRole('button', { name: '加入美式咖啡' }))
    expect(onAdd.mock.calls, '依序按「加入可頌」「加入美式咖啡」，onAdd 要收到 5 和 1').toEqual([[5], [1]])
  })

  test('有傳 category 時只顯示那個分類', () => {
    const { rerender } = render(<MenuList products={frozen(PRODUCTS)} category="food" onAdd={() => {}} />)
    expect(names(), 'category="food" 只顯示可頌、起司蛋糕').toEqual(['可頌', '起司蛋糕'])
    rerender(<MenuList products={frozen(PRODUCTS)} category="tea" onAdd={() => {}} />)
    expect(names(), 'category="tea" 只顯示伯爵紅茶').toEqual(['伯爵紅茶'])
  })

  test('沒有商品可以顯示：只有 <p>目前沒有商品</p>，沒有 <ul>', () => {
    const { container, rerender } = render(<MenuList products={frozen([])} onAdd={() => {}} />)
    expect(container.innerHTML, '空陣列時只 render <p>目前沒有商品</p>').toBe('<p>目前沒有商品</p>')
    rerender(<MenuList products={frozen(PRODUCTS.slice(0, 3))} category="tea" onAdd={() => {}} />)
    expect(container.innerHTML, '篩選之後一個都沒有（三個商品都是咖啡，category="tea"）也要顯示 <p>目前沒有商品</p>：用篩選「之後」的長度判斷').toBe('<p>目前沒有商品</p>')
  })

  test('刪掉第一個商品：備註框裡打的字跟著商品走', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MenuList products={frozen(PRODUCTS)} onAdd={() => {}} />)
    await user.type(screen.getByLabelText('拿鐵 的備註'), '少冰')
    const latteRow = rowOf('拿鐵')
    rerender(<MenuList products={frozen(PRODUCTS.slice(1))} onAdd={() => {}} />)   // 美式咖啡下架
    expect(names()).toEqual(['拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
    expect((screen.getByLabelText('拿鐵 的備註') as HTMLInputElement).value, '美式咖啡被刪掉之後，「少冰」不在拿鐵那一列了：key 用陣列位置（或沒寫 key）時，React 依位置重用 <li>，打的字留在原本的位置。key 要用 p.id').toBe('少冰')
    expect(rowOf('拿鐵'), '拿鐵那一列應該是原本的 <li>，不是重新建立的：key 不能每次 render 都不一樣（例如 Math.random()）').toBe(latteRow)
  })

  test('順序反過來：原本的 <li> 跟著商品移動', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MenuList products={frozen(PRODUCTS)} onAdd={() => {}} />)
    await user.type(screen.getByLabelText('可頌 的備註'), '加熱')
    const before = PRODUCTS.map(p => rowOf(p.name))
    rerender(<MenuList products={frozen(PRODUCTS.toReversed())} onAdd={() => {}} />)
    expect(names()).toEqual(PRODUCTS.toReversed().map(p => p.name))
    expect((screen.getByLabelText('可頌 的備註') as HTMLInputElement).value, '順序反過來之後，「加熱」要還在可頌那一列：key 用 p.id').toBe('加熱')
    expect(PRODUCTS.map((p, i) => rowOf(p.name) === before[i]), '每個商品的 <li> 都要是原本那一個 DOM 節點').toEqual(PRODUCTS.map(() => true))
  })
})
