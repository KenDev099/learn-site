import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { format } from 'node:util'
import { ProductCard } from './ProductCard.tsx'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'
import { typecheck } from '../../helpers/typecheck.ts'

// 凍結的商品：元件只要改了它任何一個屬性就會丟 TypeError
const frozen = (id: number) => deepFreeze(structuredClone(PRODUCTS.find(p => p.id === id)!)) as Product

// React 的警告用 console.error 印出，而且同一種警告只印第一次，所以這個檢查一定要是檔案裡第一個測試
function reactWarnings(run: () => void): string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  run()
  return spy.mock.calls.map(args => format(...args).split('\n')[0])
}

describe('練習 1：ProductCard 用 props 接收商品、用 onAdd 通知加入', () => {
  test('render 時 React 沒有印出警告', () => {
    const warnings = reactWarnings(() => {
      render(<ProductCard product={frozen(2)} onAdd={() => {}} />)
      render(<ProductCard product={frozen(5)} soldOut onAdd={() => {}} />)
    })
    expect(warnings, 'React 印出了警告（看訊息修）：JSX 的屬性是 DOM 的屬性名稱，class 要寫成 className').toEqual([])
  })

  test('顯示傳進來的商品：拿鐵 $110、可頌 $70', () => {
    for (const [id, text] of [[2, '拿鐵 $110'], [5, '可頌 $70']] as const) {
      const { unmount } = render(<ProductCard product={frozen(id)} onAdd={() => {}} />)
      expect(screen.getByRole('heading', { level: 3 }).textContent, `<h3> 要顯示「${text}」：用 {product.name} 和 {product.price}，不要寫死`).toBe(text)
      unmount()
    }
  })

  test('根元素 <article> 的 class：平常是 card，售完是 card sold-out', () => {
    const { unmount } = render(<ProductCard product={frozen(2)} onAdd={() => {}} />)
    expect(screen.getByRole('article').className, '沒售完時 <article> 的 class 要剛好是 card').toBe('card')
    unmount()
    render(<ProductCard product={frozen(2)} soldOut onAdd={() => {}} />)
    expect(screen.getByRole('article').className.split(/\s+/).sort(), '售完時 <article> 的 class 要是 card 和 sold-out：className={…} 裡面放運算式').toEqual(['card', 'sold-out'])
  })

  test('render 時不呼叫 onAdd；按一次「加入」呼叫一次 onAdd(商品 id)', async () => {
    const user = userEvent.setup()
    for (const id of [2, 5]) {
      const onAdd = vi.fn()
      const { unmount } = render(<ProductCard product={frozen(id)} onAdd={onAdd} />)
      expect(onAdd, '還沒按按鈕，onAdd 就被呼叫了：onClick={onAdd(product.id)} 是在 render 時「呼叫」它。要傳一個函式：onClick={() => onAdd(product.id)}').not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: '加入' }))
      await user.click(screen.getByRole('button', { name: '加入' }))
      expect(onAdd.mock.calls, `按兩次「加入」，onAdd 要被呼叫兩次，每次的參數都只有商品 id ${id}（直接寫 onClick={onAdd} 的話，收到的會是事件物件）`).toEqual([[id], [id]])
      unmount()
    }
  })

  test('沒傳 soldOut：按鈕可以按，沒有「售完」', () => {
    render(<ProductCard product={frozen(2)} onAdd={() => {}} />)
    expect(screen.getByRole('button', { name: '加入' }), 'soldOut 的預設值要是 false：解構時寫 soldOut = false').toBeEnabled()
    expect(screen.queryByText('售完'), '沒售完時不能有「售完」：用 soldOut && <span …> 決定要不要 render').not.toBeInTheDocument()
    expect(screen.getByRole('article').querySelector('.badge'), '沒售完時不能留一個空的 <span className="badge">').toBeNull()
  })

  test('售完：按鈕 disabled，顯示 <span className="badge">售完</span>，按了不會呼叫 onAdd', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<ProductCard product={frozen(2)} soldOut onAdd={onAdd} />)
    expect(screen.getByRole('button', { name: '加入' }), 'soldOut 為 true 時按鈕要 disabled：disabled={soldOut}').toBeDisabled()
    const badge = screen.getByRole('article').querySelector('span.badge')
    expect(badge?.textContent, '售完時卡片裡要有 <span className="badge">售完</span>').toBe('售完')
    await user.click(screen.getByRole('button', { name: '加入' }))
    expect(onAdd, '售完時按了不能呼叫 onAdd').not.toHaveBeenCalled()
  })

  test('props 的型別：product 與 onAdd 必填、soldOut 可省略、onAdd 收到 number', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.tsx': `
import { ProductCard } from './ProductCard.tsx'
import type { Product } from '../../helpers/fake-api.ts'
declare const latte: Product

export const ok1 = <ProductCard product={latte} onAdd={(id: number) => console.log(id)} />
export const ok2 = <ProductCard product={latte} soldOut onAdd={id => console.log(id.toFixed(0))} />
// @ts-expect-error 少了 product
export const bad1 = <ProductCard onAdd={() => {}} />
// @ts-expect-error 少了 onAdd
export const bad2 = <ProductCard product={latte} />
// @ts-expect-error soldOut 要是 boolean
export const bad3 = <ProductCard product={latte} soldOut="yes" onAdd={() => {}} />
// @ts-expect-error onAdd 收到的是 number，不是 string
export const bad4 = <ProductCard product={latte} onAdd={(id: string) => console.log(id)} />
`,
    })
    expect(errors, '型別檢查沒過。ProductCard.tsx 自己有型別錯誤就照訊息修；「Unused \'@ts-expect-error\' directive」表示該報錯的用法沒有報錯：props 要宣告成 { product: Product; soldOut?: boolean; onAdd: (productId: number) => void }，不能用 any').toBe('')
  }, 30_000)
})
