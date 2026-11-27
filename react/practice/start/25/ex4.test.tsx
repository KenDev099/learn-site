import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { staffRoute } from './features/staff/staff-routes.tsx'
import type { User } from './shared/api.ts'
import { ORDERS, createFakeShop, currentUrl, reject, renderApp, resolve, settle } from './test-utils.tsx'

const BARISTA: User = { id: 2, name: '陳美華', role: 'barista', storeId: 1 }
const MANAGER: User = { id: 1, name: '王小明', role: 'manager', storeId: 2 }
const CUSTOMER: User = { id: 5, name: '李建國', role: 'customer', storeId: null }

/** 從現在起記錄畫面上出現過的所有文字：用來確認某段內容「一次都沒出現過」 */
function recordTexts() {
  const seen: string[] = [document.body.textContent ?? '']
  // 記下每次新加進畫面的節點文字：就算它馬上又被移除，也留得下紀錄
  const observer = new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) seen.push(n.textContent ?? '')
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  return { everShown: (text: string) => seen.some(t => t.includes(text)) || (document.body.textContent ?? '').includes(text), stop: () => observer.disconnect() }
}

async function open(user: User | null, ...entries: string[]) {
  const shop = createFakeShop()
  const record = recordTexts()
  const t = renderApp([staffRoute({ user }, shop.api)], ...entries)
  await settle()
  const loginRedirect = () => t.router.state.location.pathname === '/login'
    ? new URLSearchParams(t.router.state.location.search).get('redirect')
    : null
  return { ...t, shop, record, loginRedirect }
}

describe('練習 4：店員區', () => {
  test('沒登入：導到登入頁並帶上原本的網址，看板一次都沒出現', async () => {
    const { shop, record, loginRedirect } = await open(null, '/staff/1?view=compact&sort=time')
    expect(loginRedirect(), '要導到 /login?redirect=<原本的路徑與 query>：用 URLSearchParams 編碼，不然 &sort=time 會變成 /login 自己的參數').toBe('/staff/1?view=compact&sort=time')
    expect(record.everShown('店員看板'), '沒登入時看板一次都不能出現：守衛要在 render 之前擋下（middleware），不是進了頁面再用 effect 導走').toBe(false)
    expect(shop.callsOf('getStoreOrders'), '沒登入不能抓訂單').toHaveLength(0)
    record.stop()
  })

  test('顧客進店員區：403，不導去登入頁', async () => {
    const { shop, record } = await open(CUSTOMER, '/staff/1')
    expect(currentUrl(), '顧客已經登入了，導去登入頁沒有用：網址留在 /staff/1，throw data(…, { status: 403 })').toBe('/staff/1')
    expect(screen.queryByRole('alert'), '要顯示 StaffError 的「沒有權限」').toHaveTextContent('沒有權限')
    expect(record.everShown('店員看板'), '顧客不能看到看板').toBe(false)
    expect(shop.callsOf('getStoreOrders')).toHaveLength(0)
    record.stop()
  })

  test('店員只能進自己門市；storeId 不是數字也擋下', async () => {
    for (const url of ['/staff/2', '/staff/abc', '/staff/1.0']) {
      const { shop, record, unmount } = await open(BARISTA, url)
      expect(screen.queryByRole('alert'), `陳美華是 1 號店的店員，進 ${url} 要顯示「沒有權限」：先確認 storeId 是整數字串，再跟 user.storeId 比`).toHaveTextContent('沒有權限')
      expect(record.everShown('店員看板'), `${url}：看板不能出現`).toBe(false)
      expect(shop.callsOf('getStoreOrders'), `${url}：不能抓訂單`).toHaveLength(0)
      record.stop()
      unmount()
    }
    const { shop } = await open(MANAGER, '/staff/2')
    expect(screen.queryByRole('heading', { name: '店員看板' }), '王小明是 2 號店的店長，可以進 /staff/2').not.toBeNull()
    expect(shop.callsOf('getStoreOrders').map(c => c.args)).toEqual([[2]])
  })

  test('可以取餐：每顆按鈕的名稱分得出來；等待時只停用那一顆；成功後重抓並顯示狀態訊息', async () => {
    const { shop, user } = await open(BARISTA, '/staff/1')
    await resolve(shop.callsOf('getStoreOrders')[0])
    const status = screen.getByRole('status', { name: '' })
    expect(status, '<p role="status"> 一開始就要在畫面上（內容是空的），之後只換文字，讀螢幕軟體才會唸出變化').toHaveTextContent('')
    const btn = screen.queryByRole('button', { name: '王小明的訂單可以取餐' })
    expect(btn, '按鈕畫面上的字都是「可以取餐」，名稱要用 aria-label 加上顧客：「王小明的訂單可以取餐」').not.toBeNull()
    await user.click(btn!)
    expect(shop.callsOf('markReady').map(c => c.args), '按下去呼叫 api.markReady(1)').toEqual([[1]])
    expect(btn, '等待時這顆按鈕要 disabled').toBeDisabled()
    expect(screen.getByRole('button', { name: '陳美華的訂單可以取餐' }), '別的訂單的按鈕不能跟著停用：用 mutation.variables 判斷是哪一筆').toBeEnabled()
    await resolve(shop.callsOf('markReady')[0])
    expect(shop.callsOf('getStoreOrders'), '成功之後要讓 [\'staff-orders\', storeId] 失效，看板重抓').toHaveLength(2)
    expect(btn, 'onSuccess 要回傳 invalidateQueries 的 Promise：重抓完成之前 mutation 都還算進行中，按鈕不能先恢復（店員會再按一次）').toBeDisabled()
    expect(screen.getByRole('status', { name: '' }).textContent, '重抓完成前先不要顯示成功').toBe('')
    await resolve(shop.callsOf('getStoreOrders')[1], ORDERS.filter(o => o.storeId === 1).map(o => (o.id === 1 ? { ...o, status: 'ready' } : o)))
    expect(screen.getByRole('status', { name: '' }), '成功之後狀態訊息是「已通知王小明取餐」，而且是同一個元素').toBe(status)
    expect(status).toHaveTextContent('已通知王小明取餐')
    expect(screen.queryByRole('button', { name: '王小明的訂單可以取餐' }), '重抓之後王小明的訂單已經好了，按鈕消失').toBeNull()
  })

  test('失敗：顯示錯誤；再按一次時錯誤先消失；不做樂觀更新', async () => {
    const { shop, user } = await open(BARISTA, '/staff/1')
    await resolve(shop.callsOf('getStoreOrders')[0])
    await user.click(screen.getByRole('button', { name: '陳美華的訂單可以取餐' }))
    expect(screen.getByText(/陳美華/).textContent, '等待時畫面還是「已收單」：伺服器確認之前不要先改看板').toContain('已收單')
    await reject(shop.callsOf('markReady')[0])
    expect(screen.queryByRole('alert'), '失敗要顯示 <p role="alert">標記失敗，請再試一次</p>').toHaveTextContent('標記失敗，請再試一次')
    expect(shop.callsOf('getStoreOrders'), '失敗不用重抓').toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '陳美華的訂單可以取餐' }))
    expect(screen.queryByRole('alert'), '再按一次時，上一次的錯誤要先消失').toBeNull()
  })
})
