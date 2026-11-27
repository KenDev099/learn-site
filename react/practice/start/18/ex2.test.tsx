import { describe, expect, test } from 'vitest'
import { act, screen } from '@testing-library/react'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'
import { productRoute } from './ProductPage.tsx'
import { recordTexts, renderRoutes, settle, withShell } from './test-utils.tsx'

function open(url: string) {
  const api = createFakeMenuApi({ manual: true })
  const routes = withShell([
    { path: 'menu', Component: () => <h1>菜單頁</h1> },
    { path: 'menu/:id', ...productRoute(api) },
  ])
  const t = renderRoutes(routes, url)
  const calls = () => api.callsOf('getProduct')
  const finish = async (i: number, how: 'resolve' | 'reject' = 'resolve', value?: unknown) => {
    const call = calls()[i]
    expect(call, `第 ${i + 1} 次 api.getProduct 沒有被呼叫`).toBeDefined()
    await act(async () => { call[how](value) })
    await settle()
  }
  const go = (to: string) => act(async () => { void t.router.navigate(to) })
  return { ...t, api, calls, finish, go }
}
const alertText = () => screen.queryByRole('alert')?.textContent ?? null

describe('練習 2：loader、useLoaderData 與 ErrorBoundary', () => {
  test('進入商品頁：loader 抓完才顯示，顯示品名與價格', async () => {
    const { calls, finish } = open('/menu/2')
    const record = recordTexts()
    expect(calls().map(c => c.args), '進入 /menu/2 要呼叫 api.getProduct(2)，第一個參數是數字').toEqual([[2]])
    expect(screen.queryByText('準備中…'), '資料要在 loader 裡抓：路由會等 loader 完成才顯示頁面（這段時間測試的外層顯示「準備中…」）。現在頁面沒等資料就先畫出來了，表示還在元件的 effect 裡抓').not.toBeNull()
    await finish(0)
    expect(screen.queryByRole('heading', { name: '拿鐵' }), '資料回來後要用 useLoaderData 讀出商品，顯示 <h1>拿鐵</h1>').not.toBeNull()
    expect(screen.queryByText('$110'), '要顯示「$110」').not.toBeNull()
    expect(record.everShown('載入中…'), '用 loader 之後，元件拿到資料時一定已經有商品，不需要也不該出現「載入中…」').toBe(false)
    record.stop()
  })

  test('loader 把 request.signal 傳給 API：換商品時，還沒回來的舊請求被取消', async () => {
    const { calls, finish, go } = open('/menu/2')
    expect(calls()[0]?.signal, 'api.getProduct 的第二個參數要傳 { signal: request.signal }（loader 收到的 request）').toBeInstanceOf(AbortSignal)
    await finish(0)
    await go('/menu/4')
    await go('/menu/5')
    expect(calls().map(c => c.args), '從 2 換到 4 再換到 5，要各呼叫一次').toEqual([[2], [4], [5]])
    expect(calls()[1].signal?.aborted, '伯爵紅茶（4）還沒回來就換到可頌（5），4 的請求要被取消：用 loader 收到的 request.signal').toBe(true)
    await finish(2)
    expect(screen.queryByRole('heading', { name: '可頌' }), '最後要顯示可頌').not.toBeNull()
  })

  test.each(['abc', '-1', '2.5'])('/menu/%s 不是商品編號：不呼叫 API，顯示「找不到商品」', async id => {
    const { calls } = open(`/menu/${id}`)
    await settle()
    expect(calls().length, `/menu/${id} 的 id 不是純數字，不要呼叫 API（Number('abc') 是 NaN）：在 loader 開頭檢查，throw data('找不到商品', { status: 404 })`).toBe(0)
    expect(alertText(), '要顯示 role="alert" 的「找不到商品」：ErrorBoundary 用 isRouteErrorResponse 判斷 404').toContain('找不到商品')
  })

  test('商品不存在（API 丟出 NotFoundError）：顯示「找不到商品」，頁首還在', async () => {
    const { calls, finish } = open('/menu/99')
    expect(calls().map(c => c.args)).toEqual([[99]])
    await finish(0)   // 假 API 找不到 99，丟出 NotFoundError
    expect(alertText(), 'NotFoundError 要轉成 throw data(\'找不到商品\', { status: 404 })，ErrorBoundary 對 404 顯示「找不到商品」（不要顯示 statusText，data() 沒給 statusText 時是 Internal Server Error）').toContain('找不到商品')
    expect(alertText(), '404 只顯示「找不到商品」').not.toContain('載入失敗')
    expect(screen.queryByText('測試頁首'), '錯誤只換掉商品頁這一塊：ErrorBoundary 要放在這條路由上（productRoute 回傳 ErrorBoundary），不然錯誤會一路冒到最外層，整個畫面被換掉').not.toBeNull()
  })

  test('其他錯誤：顯示「載入失敗：錯誤訊息」，不當成 404', async () => {
    const { finish } = open('/menu/2')
    await finish(0, 'reject', new Error('網路連線中斷'))
    expect(alertText(), '網路錯誤不是「找不到商品」：只有 NotFoundError 轉成 404，其他錯誤原樣丟出，ErrorBoundary 顯示「載入失敗：網路連線中斷」').toContain('載入失敗：網路連線中斷')
    expect(screen.queryByText('測試頁首'), '錯誤只換掉商品頁這一塊，外層的頁首要還在').not.toBeNull()
  })

  test('錯誤畫面的「回菜單」連結可以離開錯誤', async () => {
    const { user } = open('/menu/abc')
    await settle()
    const link = screen.queryByRole('link', { name: '回菜單' })
    expect(link, '錯誤畫面要有連到 /menu 的「回菜單」連結（用 <Link to="/menu">）').not.toBeNull()
    await user.click(link!)
    expect(screen.queryByRole('heading', { name: '菜單頁' }), '點「回菜單」要換到 /menu').not.toBeNull()
    expect(screen.queryByRole('alert'), '換到別的頁面，錯誤畫面就消失').toBeNull()
  })
})
