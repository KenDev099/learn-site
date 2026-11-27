import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProductDetail } from './ProductDetail.tsx'
import { createFakeMenuApi, NotFoundError } from '../../helpers/fake-api.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

function setup(productId = 2) {
  const api = createFakeMenuApi({ manual: true })
  const view = render(<ProductDetail productId={productId} api={api} />)
  const calls = () => api.callsOf('getProduct')
  const show = (id: number) => view.rerender(<ProductDetail productId={id} api={api} />)
  // 讓第 i 個請求完成（或失敗），並等 React 把結果更新到畫面
  const settle = (i: number, error?: Error) => act(async () => { error ? calls()[i].reject(error) : calls()[i].resolve() })
  return { api, calls, show, settle, ...view }
}
const name = () => document.querySelector('.name')?.textContent ?? null

describe('練習 5：ProductDetail 抓資料與競態', () => {
  test('掛載時載入商品：先顯示載入中，回來後顯示品名與價格', async () => {
    const { calls, settle } = setup()
    expect(calls().map(c => c.args), '掛載時要呼叫 api.getProduct(2)').toEqual([[2]])
    expect(screen.getByText('載入中…'), '還沒回來時顯示「載入中…」').toBeInTheDocument()
    await settle(0)
    expect(name(), '載入完在 .name 顯示「拿鐵 $110」').toBe('拿鐵 $110')
  })

  test('productId 改變時重新載入，載入期間回到「載入中…」', async () => {
    const { calls, show, settle } = setup()
    await settle(0)
    show(5)
    expect(calls().map(c => c.args), 'productId 從 2 換成 5，要再呼叫 api.getProduct(5)：productId 要列在依賴陣列').toEqual([[2], [5]])
    expect(name(), '可頌還沒回來，畫面卻還顯示拿鐵：換商品時要先把 product 清成 null').toBe(null)
    expect(screen.getByText('載入中…')).toBeInTheDocument()
    await settle(1)
    expect(name(), '換商品後要顯示「可頌 $70」').toBe('可頌 $70')
  })

  test('舊的回應比較晚回來，也不能蓋掉新的商品', async () => {
    const { calls, show, settle } = setup()
    show(5)
    expect(calls().length, 'productId 改變時要重新呼叫 api.getProduct').toBe(2)
    await settle(1)
    await settle(0)
    expect(name(), '拿鐵（舊請求）比可頌晚回來，畫面卻變回拿鐵：在清理函式裡把 ignore 設成 true，回應回來時檢查它').toBe('可頌 $70')
  })

  test('換商品或卸載時取消還沒回來的請求，被取消不算錯誤', async () => {
    const { calls, show, settle, unmount } = setup()
    expect(calls()[0].signal, '要把 AbortController 的 signal 傳給 api.getProduct(productId, { signal })').toBeInstanceOf(AbortSignal)
    expect(calls()[0].signal?.aborted, '請求進行中不能先取消').toBe(false)
    show(5)
    await act(async () => {})
    expect(calls()[0].signal?.aborted, '換商品時要在清理函式裡 controller.abort()，取消上一個請求').toBe(true)
    expect(screen.queryByRole('alert'), '被取消的請求顯示成錯誤了：清理之後（ignore 是 true）不管成功或失敗都不要再改 state').toBe(null)
    await settle(1)
    expect(name()).toBe('可頌 $70')
    show(6)
    unmount()
    expect(calls()[2].signal?.aborted, '元件卸載時也要取消還沒回來的請求').toBe(true)
  })

  test('失敗時顯示錯誤，換到別的商品時錯誤清掉', async () => {
    const { show, settle } = setup(99)
    await settle(0, new NotFoundError('找不到商品 99'))
    expect(screen.getByRole('alert'), '失敗時在 role="alert" 的元素顯示錯誤的 message').toHaveTextContent('找不到商品 99')
    show(1)
    expect(screen.queryByRole('alert'), '換到別的商品之後，上一個商品的錯誤還留在畫面上：重新載入前把 error 清掉').toBe(null)
    await settle(1)
    expect(name(), '換到 1 號商品後顯示「美式咖啡 $80」').toBe('美式咖啡 $80')
  })

  test('通過 react-hooks 的檢查，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'ProductDetail.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉檢查').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 檢查沒過：effect 用到的 productId、api 都要列在依賴陣列；effect 的函式不能是 async').toEqual([])
  }, 20000)
})
