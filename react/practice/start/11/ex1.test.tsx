import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CurrentStoreProvider, useCurrentStore } from './current-store.tsx'
import { typecheck } from '../../helpers/typecheck.ts'

// 讀門市的元件（第 3 層）
function PriceTag() {
  const { store } = useCurrentStore()
  return <p>價格標籤：{store.name}</p>
}
function OrderTitle() {
  const { store } = useCurrentStore()
  return <h2>{store.name}的訂單</h2>
}
// 切換門市；switchStore 丟錯時把訊息顯示出來
function Switcher({ to }: { to: number }) {
  const { switchStore } = useCurrentStore()
  const [error, setError] = useState('')
  function onClick() {
    try {
      switchStore(to)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <button type="button" onClick={onClick}>切到門市 {to}</button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
// 中間層：完全不知道門市，也沒有 store 這個 prop
function ProductList() {
  return <ul><li><PriceTag /></li></ul>
}
function MenuPage({ label }: { label: string }) {
  return (
    <section aria-label={label}>
      <OrderTitle />
      <ProductList />
      <Switcher to={1} />
      <Switcher to={2} />
      <Switcher to={99} />
    </section>
  )
}

describe('練習 1：CurrentStoreProvider 與 useCurrentStore', () => {
  test('好幾層底下的元件直接讀到 initialId 那一家門市', () => {
    render(<CurrentStoreProvider initialId={1}><MenuPage label="後台" /></CurrentStoreProvider>)
    expect(screen.getByText(/價格標籤/), 'initialId={1} 時 store 要是總店：Provider 用 <Context value={…}> 把 { store, switchStore } 往下提供，useCurrentStore() 用 use(Context) 讀').toHaveTextContent('價格標籤：總店')
    expect(screen.getByRole('heading')).toHaveTextContent('總店的訂單')
  })

  test('initialId 是 2 時，一開始就是分店', () => {
    render(<CurrentStoreProvider initialId={2}><MenuPage label="後台" /></CurrentStoreProvider>)
    expect(screen.getByText(/價格標籤/), 'initialId={2} 時 store 要是分店：初始的門市要用 initialId 從 STORES 找，不要寫死').toHaveTextContent('價格標籤：分店')
  })

  test('switchStore(id) 之後，所有讀門市的元件都更新', async () => {
    const user = userEvent.setup()
    render(<CurrentStoreProvider initialId={1}><MenuPage label="後台" /></CurrentStoreProvider>)
    await user.click(screen.getByRole('button', { name: '切到門市 2' }))
    expect(screen.getByText(/價格標籤/), 'switchStore(2) 之後要變成分店：目前門市要放在 Provider 的 state，用 setState 換成另一個門市物件（不要改原本物件的屬性）').toHaveTextContent('價格標籤：分店')
    expect(screen.getByRole('heading'), '同一個 Provider 底下的每個元件都要拿到新的門市').toHaveTextContent('分店的訂單')
    await user.click(screen.getByRole('button', { name: '切到門市 1' }))
    expect(screen.getByText(/價格標籤/), '再 switchStore(1) 要切回總店').toHaveTextContent('價格標籤：總店')
  })

  test('switchStore 收到不存在的 id 要丟錯，目前門市不變', async () => {
    const user = userEvent.setup()
    render(<CurrentStoreProvider initialId={2}><MenuPage label="後台" /></CurrentStoreProvider>)
    await user.click(screen.getByRole('button', { name: '切到門市 99' }))
    expect(screen.getByRole('alert'), 'STORES 裡沒有 id 99：switchStore(99) 要在被呼叫的當下丟出 Error("找不到門市 99")（先找到門市再 setState）').toHaveTextContent('找不到門市 99')
    expect(screen.getByText(/價格標籤/), 'switchStore 丟錯之後，目前門市要維持原本的分店').toHaveTextContent('價格標籤：分店')
  })

  test('巢狀的 Provider：讀到最近的那一層，切換也只影響那一層', async () => {
    const user = userEvent.setup()
    render(
      <CurrentStoreProvider initialId={1}>
        <MenuPage label="外層" />
        <CurrentStoreProvider initialId={2}><MenuPage label="內層" /></CurrentStoreProvider>
      </CurrentStoreProvider>,
    )
    const outer = within(screen.getByRole('region', { name: '外層' }))
    const inner = within(screen.getByRole('region', { name: '內層' }))
    expect(inner.getByRole('heading'), '內層 Provider 底下要讀到內層的門市（分店）').toHaveTextContent('分店的訂單')
    expect(outer.getByRole('heading')).toHaveTextContent('總店的訂單')
    await user.click(inner.getByRole('button', { name: '切到門市 1' }))
    await user.click(outer.getByRole('button', { name: '切到門市 2' }))
    expect(inner.getByRole('heading'), '內層切到總店').toHaveTextContent('總店的訂單')
    expect(outer.getByRole('heading'), '外層切到分店，不受內層影響').toHaveTextContent('分店的訂單')
  })

  test('兩個並排的 Provider 各自獨立', async () => {
    const user = userEvent.setup()
    render(
      <>
        <CurrentStoreProvider initialId={1}><MenuPage label="左" /></CurrentStoreProvider>
        <CurrentStoreProvider initialId={1}><MenuPage label="右" /></CurrentStoreProvider>
      </>,
    )
    const left = within(screen.getByRole('region', { name: '左' }))
    const right = within(screen.getByRole('region', { name: '右' }))
    await user.click(left.getByRole('button', { name: '切到門市 2' }))
    expect(left.getByRole('heading')).toHaveTextContent('分店的訂單')
    expect(right.getByRole('heading'), '左邊切換門市，右邊不能跟著變：state 要放在 Provider 元件裡（useState），不能放在模組層級的變數').toHaveTextContent('總店的訂單')
    await user.click(right.getByRole('button', { name: '切到門市 2' }))
    await user.click(left.getByRole('button', { name: '切到門市 1' }))
    expect(left.getByRole('heading'), '右邊切換之後，左邊還要能自己切回總店').toHaveTextContent('總店的訂單')
    expect(right.getByRole('heading')).toHaveTextContent('分店的訂單')
  })

  test('上面沒有 CurrentStoreProvider 時，useCurrentStore() 丟出說明清楚的錯誤', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      () => render(<PriceTag />),
      'createContext 的預設值給 null；useCurrentStore() 讀到 null 就 throw new Error("useCurrentStore() 必須在 <CurrentStoreProvider> 之下使用")，不要回傳假的預設門市',
    ).toThrow('useCurrentStore() 必須在 <CurrentStoreProvider> 之下使用')
  })

  test('useCurrentStore() 的回傳型別不含 null，switchStore 只收 number', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.tsx': `
import { CurrentStoreProvider, useCurrentStore } from './current-store.tsx'
export function Tag() {
  const { store, switchStore } = useCurrentStore()
  return <button onClick={() => switchStore(2)}>{store.name.padEnd(4)}</button>
}
export const app = <CurrentStoreProvider initialId={1}><Tag /></CurrentStoreProvider>
export function Bad() {
  // @ts-expect-error switchStore 的參數是 number
  useCurrentStore().switchStore('2')
  // @ts-expect-error store 沒有 price 這個屬性（不能是 any）
  return useCurrentStore().store.price
}
`,
    })
    expect(errors, 'useCurrentStore() 要回傳 CurrentStore（不是 CurrentStore | null，也不是 any）：null 的情況在 hook 裡丟錯，呼叫的人不用再檢查').toBe('')
  }, 30000)
})
