import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuSection } from './MenuSection.tsx'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

// 首頁：菜單區塊旁邊有購物車；「+1」讓首頁重新 render
function Home({ api }: { api: ReturnType<typeof createFakeMenuApi> }) {
  const [count, setCount] = useState(2)
  return (
    <>
      <MenuSection api={api} />
      <aside>購物車：{count} 件 <button type="button" onClick={() => setCount(c => c + 1)}>+1</button></aside>
    </>
  )
}

async function setup() {
  const user = userEvent.setup()
  const api = createFakeMenuApi({ manual: true })
  try {
    await act(async () => { render(<Home api={api} />) })
  } catch (e) {
    throw new Error(`畫面沒辦法顯示（${String(e)}）`)
  }
  const calls = () => api.callsOf('getMenu')
  // 錯誤一路傳到最上層、整個畫面被卸載時，act 會把錯誤丟出來
  const guard = async (run: () => Promise<void>) => {
    try {
      await act(run)
    } catch (e) {
      throw new Error(`錯誤沒有被攔下來，整個畫面（連購物車）都不見了（${String(e)}）：用練習 3 的 ErrorBoundary 包住 Suspense`)
    }
  }
  const click = (name: string) => {
    const button = screen.queryByRole('button', { name })
    if (!button) throw new Error(`畫面上找不到「${name}」按鈕${name === '重試' ? '：失敗時 ErrorBoundary 的 fallback 要畫出「重試」按鈕' : ''}`)
    return guard(async () => { await user.click(button) })
  }
  const settle = (i: number, error?: Error) => {
    const call = calls()[i]
    if (!call) throw new Error(`api.getMenu() 只被呼叫了 ${calls().length} 次，等不到第 ${i + 1} 次的請求`)
    return guard(async () => { if (error) call.reject(error); else call.resolve() })
  }
  const items = () => screen.queryAllByRole('listitem').filter(li => li.closest('[style*="none"]') === null).map(li => li.textContent)
  return { api, calls, click, settle, items }
}

describe('練習 4：MenuSection 用 Suspense 等資料、ErrorBoundary 接失敗、可以重試', () => {
  test('掛載時呼叫 api.getMenu() 一次，載入中顯示 fallback，標題和購物車都在', async () => {
    const { calls } = await setup()
    expect(calls(), '掛載時要呼叫 api.getMenu() 剛好一次：Promise 不能在 render 時建立（每次重試 render 都會再建立一個），用 useState(() => api.getMenu())').toHaveLength(1)
    expect(screen.queryByRole('status'), '載入中顯示 <p role="status">載入菜單中…</p>：用 <Suspense fallback={…}> 包住 MenuList，MenuList 裡不要用 try/catch 包 use()').toHaveTextContent('載入菜單中…')
    expect(screen.getByRole('heading', { name: '菜單' })).toBeVisible()
    expect(screen.getByText(/購物車：2 件/)).toBeInTheDocument()
  })

  test('成功：顯示每個商品；首頁重新 render 不會再呼叫 API', async () => {
    const { calls, click, settle, items } = await setup()
    await settle(0)
    expect(items(), '每個商品一個 <li>「品名 $價格」').toEqual(['美式咖啡 $80', '拿鐵 $110', '卡布奇諾 $110', '伯爵紅茶 $90', '可頌 $70', '起司蛋糕 $120'])
    expect(screen.queryByRole('status')).toBeNull()
    await click('+1')
    expect(screen.getByText(/購物車：3 件/)).toBeInTheDocument()
    expect(calls(), '首頁重新 render 時又呼叫了 api.getMenu()：Promise 要存在 state 裡').toHaveLength(1)
  })

  test('失敗：只有菜單的位置換成錯誤訊息和「重試」，標題和購物車照常顯示', async () => {
    const { settle } = await setup()
    await settle(0, new Error('伺服器忙碌'))
    expect(screen.queryByRole('alert'), '失敗時要顯示 <p role="alert">：用 ErrorBoundary 包住 Suspense，use() 讀到失敗的 Promise 會把錯誤丟給最近的錯誤邊界').toHaveTextContent('菜單載入失敗：伺服器忙碌')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(screen.getByText(/購物車：2 件/), 'MenuSection 外面的購物車不見了').toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '菜單' }), '標題「菜單」不見了：ErrorBoundary 只包住菜單清單的部分，不要包住整個 section').toBeInTheDocument()
    expect(screen.queryByRole('status'), '失敗之後不能還顯示載入中').toBeNull()
  })

  test('重試：再呼叫一次 API、回到載入中，成功後顯示菜單', async () => {
    const { calls, click, settle, items } = await setup()
    await settle(0, new Error('伺服器忙碌'))
    await click('重試')
    expect(calls(), '按「重試」要重新呼叫 api.getMenu()：失敗的 Promise 不會變成功，要換一個新的 Promise 存進 state').toHaveLength(2)
    expect(screen.queryByRole('alert'), '按「重試」後錯誤訊息還在：要呼叫 fallback 拿到的 reset()，讓 ErrorBoundary 清掉錯誤').toBeNull()
    expect(screen.queryByRole('status'), '重試中要回到「載入菜單中…」').toHaveTextContent('載入菜單中…')
    await settle(1)
    expect(items()).toHaveLength(6)
  })

  test('重試又失敗：再顯示錯誤，還可以再重試', async () => {
    const { calls, click, settle, items } = await setup()
    await settle(0, new Error('伺服器忙碌'))
    await click('重試')
    await settle(1, new Error('連線逾時'))
    expect(screen.queryByRole('alert'), '第二次失敗要顯示新的錯誤訊息').toHaveTextContent('菜單載入失敗：連線逾時')
    await click('重試')
    expect(calls()).toHaveLength(3)
    await settle(2)
    expect(items()).toHaveLength(6)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
