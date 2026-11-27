import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { ApiProvider, useApi } from './api-context.tsx'
import { MenuCount } from './MenuCount.tsx'
import { createFakeMenuApi, PRODUCTS } from '../../helpers/fake-api.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

const two = () => structuredClone(PRODUCTS.slice(0, 2))

describe('練習 4：用 context 注入 API 用戶端', () => {
  test('MenuCount 用 ApiProvider 提供的 api 載入菜單', async () => {
    const api = createFakeMenuApi()
    render(<ApiProvider api={api}><main><MenuCount /></main></ApiProvider>)
    expect(screen.getByText('載入中…')).toBeInTheDocument()
    expect(await screen.findByText('共 6 項商品', {}, { timeout: 500 }).catch(() => null), 'MenuCount 要用 useApi() 拿到 ApiProvider 的 api 再呼叫 api.getMenu()，不能直接 import realClient（測試裡它一定失敗）').not.toBeNull()
    expect(api.callsOf('getMenu'), 'getMenu 只該被呼叫一次').toHaveLength(1)
    expect(api.callsOf('getMenu')[0].signal, '呼叫 getMenu 時要傳 { signal }').toBeInstanceOf(AbortSignal)
  })

  test('顯示的數量來自 api 的回應', async () => {
    const api = createFakeMenuApi({ manual: true })
    render(<ApiProvider api={api}><MenuCount /></ApiProvider>)
    expect(api.callsOf('getMenu'), 'MenuCount 掛載後要呼叫 ApiProvider 提供的 api.getMenu()').toHaveLength(1)
    await act(async () => api.calls[0].resolve(two()))
    expect(screen.getByText(/^共/), 'api 回傳 2 項商品時要顯示「共 2 項商品」').toHaveTextContent('共 2 項商品')
  })

  test('api 失敗時顯示錯誤', async () => {
    const api = createFakeMenuApi({ manual: true })
    render(<ApiProvider api={api}><MenuCount /></ApiProvider>)
    expect(api.callsOf('getMenu'), 'MenuCount 掛載後要呼叫 ApiProvider 提供的 api.getMenu()').toHaveLength(1)
    await act(async () => api.calls[0].reject(new Error('500')))
    expect(screen.getByRole('alert')).toHaveTextContent('載入失敗')
  })

  test('兩個 ApiProvider 各自獨立，巢狀時用最近的那一層', async () => {
    const real = createFakeMenuApi()
    const demo = createFakeMenuApi({ manual: true })
    render(
      <ApiProvider api={real}>
        <section aria-label="正式"><MenuCount /></section>
        <ApiProvider api={demo}>
          <section aria-label="展示"><MenuCount /></section>
        </ApiProvider>
      </ApiProvider>,
    )
    await within(screen.getByRole('region', { name: '正式' })).findByText('共 6 項商品')
    expect(demo.callsOf('getMenu'), '內層 ApiProvider 底下的 MenuCount 要呼叫內層的 api').toHaveLength(1)
    await act(async () => demo.calls[0].resolve(two()))
    expect(within(screen.getByRole('region', { name: '展示' })).getByText(/^共/)).toHaveTextContent('共 2 項商品')
    expect(within(screen.getByRole('region', { name: '正式' })).getByText(/^共/), '外層的 MenuCount 不能受內層影響：api 要用 context 的 value 傳，不能存在模組層級的變數').toHaveTextContent('共 6 項商品')
    expect(real.callsOf('getMenu'), '外層的 api 只該被呼叫一次').toHaveLength(1)
    expect(demo.callsOf('getMenu'), '內層的 api 只該被呼叫一次').toHaveLength(1)
  })

  test('ApiProvider 換了 api：取消舊請求，用新的 api 重新載入', async () => {
    const first = createFakeMenuApi({ manual: true })
    const second = createFakeMenuApi({ manual: true })
    const { rerender } = render(<ApiProvider api={first}><MenuCount /></ApiProvider>)
    expect(first.callsOf('getMenu')).toHaveLength(1)
    rerender(<ApiProvider api={second}><MenuCount /></ApiProvider>)
    expect(second.callsOf('getMenu'), 'api 換了要重新載入：ApiProvider 的 value 直接用 props 的 api（不要複製到 state），MenuCount 的 effect 依賴陣列要有 api').toHaveLength(1)
    expect(first.calls[0].signal?.aborted, '換 api 時要取消上一個請求（effect 的清理函式）').toBe(true)
    await act(async () => second.calls[0].resolve(two()))
    expect(screen.getByText(/^共/)).toHaveTextContent('共 2 項商品')
    expect(screen.queryByRole('alert'), '被取消的舊請求不能把畫面改成「載入失敗」').not.toBeInTheDocument()
  })

  test('卸載時取消請求', () => {
    const api = createFakeMenuApi({ manual: true })
    const { unmount } = render(<ApiProvider api={api}><MenuCount /></ApiProvider>)
    expect(api.callsOf('getMenu')).toHaveLength(1)
    unmount()
    expect(api.calls[0].signal?.aborted, '卸載時要 abort 還沒完成的請求').toBe(true)
  })

  test('上面沒有 ApiProvider 時 useApi() 丟出說明清楚的錯誤', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Probe() { useApi(); return null }
    expect(
      () => render(<Probe />),
      'createContext 的預設值給 null，useApi() 讀到 null 就丟錯；不要用 realClient 當預設值',
    ).toThrow('useApi() 必須在 <ApiProvider> 之下使用')
  })

  test('MenuCount 的依賴陣列沒有違反 react-hooks 的規則，也沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'MenuCount.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉警告：把 api 列進依賴陣列').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'effect 用到的 api 要列在依賴陣列').toEqual([])
  }, 20000)
})
