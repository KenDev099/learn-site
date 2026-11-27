import { Suspense } from 'react'
import { describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductDetail, ProductPanel } from './ProductPanel.tsx'
import { createFakeMenuApi, type Product } from '../../helpers/fake-api.ts'
import { deferred } from '../../helpers/deferred.ts'

const MENU = [{ id: 2, name: '拿鐵' }, { id: 5, name: '可頌' }, { id: 6, name: '起司蛋糕' }]

// 會讓元件暫停（suspend）的操作要包在 await act(...) 裡，React 才會在 Promise 完成後重新 render
async function setup(products = MENU) {
  const user = userEvent.setup()
  const api = createFakeMenuApi({ manual: true })
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(<ProductPanel api={api} products={products} />) })
  const calls = () => api.callsOf('getProduct')
  const choose = (name: string) => act(async () => { await user.click(screen.getByRole('button', { name })) })
  const settle = (i: number, value?: Product) => act(async () => { calls()[i].resolve(value) })
  return { api, calls, choose, settle, ...view }
}
const shown = () => {
  const el = document.querySelector<HTMLElement>('.name')
  return el && el.style.display !== 'none' ? el.textContent : null
}

describe('練習 2：ProductPanel 用 Suspense 和 use() 讀商品', () => {
  test('ProductDetail 用 use() 讀 productPromise：等待時顯示外面那層 Suspense 的 fallback', async () => {
    const d = deferred<Product>()
    try {
      await act(async () => {
        render(<Suspense fallback={<p>外層等待中</p>}><ProductDetail productPromise={d.promise} /></Suspense>)
      })
    } catch (e) {
      throw new Error(`<ProductDetail productPromise={…} /> 畫不出來（${String(e)}）：ProductDetail 的 props 改成 { productPromise }，用 use(productPromise) 讀`)
    }
    expect(screen.queryByText('外層等待中'), 'Promise 還沒完成時要顯示最近的 Suspense 的 fallback：ProductDetail 用 use(productPromise) 讀，不要自己用 state 管「載入中」').toBeInTheDocument()
    expect(document.querySelector('.name'), 'Promise 還沒完成，不能先畫出 .name').toBeNull()
    await act(async () => { d.resolve({ id: 3, name: '卡布奇諾', price: 110, category: 'coffee' }) })
    expect(shown(), 'Promise 完成後在 .name 顯示「品名 $價格」').toBe('卡布奇諾 $110')
    expect(screen.queryByText('外層等待中'), '完成後 fallback 要消失').toBeNull()
  })

  test('還沒選商品：顯示「請選擇商品」，不呼叫 API', async () => {
    const { calls } = await setup()
    expect(screen.getByText('請選擇商品')).toBeInTheDocument()
    expect(calls(), '還沒點任何商品就呼叫了 api.getProduct').toHaveLength(0)
  })

  test('點商品：在點擊時呼叫一次 api.getProduct，載入中只有詳細資料的位置換成 fallback', async () => {
    const { calls, choose } = await setup()
    await choose('拿鐵')
    expect(calls().map(c => c.args), '點「拿鐵」要呼叫 api.getProduct(2) 一次：在 onClick 裡呼叫，不要在 render 的過程中呼叫（React 每次重試 render 都會再呼叫一次）').toEqual([[2]])
    expect(screen.queryByRole('status'), '載入中要顯示 <p role="status">載入商品中…</p>：用 <Suspense fallback={…}> 包住 ProductDetail').toHaveTextContent('載入商品中…')
    expect(screen.getByRole('heading', { name: '商品資訊' }), '載入中標題被藏起來了：Suspense 只包住 ProductDetail，不要包住整個面板').toBeVisible()
    expect(screen.getByRole('button', { name: '可頌' }), '載入中商品按鈕被藏起來了：Suspense 只包住 ProductDetail').toBeVisible()
    expect(screen.queryByText('請選擇商品'), '選了商品之後不再顯示「請選擇商品」').toBeNull()
  })

  test('回應回來後顯示 API 給的商品；父元件重新 render 不會再呼叫 API', async () => {
    const { calls, choose, settle, rerender, api } = await setup()
    await choose('拿鐵')
    await settle(0, { id: 2, name: '冰拿鐵', price: 120, category: 'coffee' })
    expect(shown(), '要顯示 API 回傳的資料（這次是「冰拿鐵 $120」），不能寫死').toBe('冰拿鐵 $120')
    expect(screen.queryByRole('status'), '資料回來之後 fallback 要消失').toBeNull()
    await act(async () => { rerender(<ProductPanel api={api} products={[...MENU]} />) })
    expect(calls(), '父元件重新 render 時又呼叫了 api.getProduct：Promise 要在點擊時建立、存在 state，不要在 render 時建立').toHaveLength(1)
  })

  test('換商品：先回到 fallback，再顯示新的商品', async () => {
    const { calls, choose, settle } = await setup()
    await choose('拿鐵')
    await settle(0)
    await choose('起司蛋糕')
    expect(calls().map(c => c.args)).toEqual([[2], [6]])
    expect(shown(), '起司蛋糕還沒回來，畫面上不能還看得到拿鐵').toBe(null)
    expect(screen.queryByRole('status'), '換商品時要回到 fallback「載入商品中…」').toHaveTextContent('載入商品中…')
    await settle(1)
    expect(shown()).toBe('起司蛋糕 $120')
  })

  test.each([
    ['新的先回來', [1, 0]], ['舊的先回來', [0, 1]],
  ] as const)('連點兩個商品（%s），最後顯示的是最後點的', async (_, order) => {
    const { choose, settle } = await setup()
    await choose('拿鐵')
    await choose('可頌')
    await settle(order[0])
    if (order[0] === 0) expect(shown(), '拿鐵（舊的請求）先回來了，但使用者最後點的是可頌：畫面要繼續等可頌').toBe(null)
    await settle(order[1])
    expect(shown(), '最後點的是可頌，畫面卻不是可頌：把「這一次的 Promise」存進 state，畫面只讀最新的那個').toBe('可頌 $70')
  })
})
