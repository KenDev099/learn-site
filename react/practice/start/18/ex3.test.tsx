import { describe, expect, test } from 'vitest'
import { act, screen } from '@testing-library/react'
import { BARISTA, MANAGER, createAdminApi, type Auth, type User } from './admin-api.ts'
import { adminRoute } from './admin-routes.tsx'
import { currentUrl, recordTexts, renderRoutes, settle, withShell } from './test-utils.tsx'

async function open(user: User | null, ...entries: string[]) {
  const auth: Auth = { user }
  const api = createAdminApi()
  const record = recordTexts()
  const t = renderRoutes(withShell([adminRoute(auth, api)]), ...entries)
  await settle()
  const go = async (to: string | number) => {
    await act(async () => { void t.router.navigate(to as string) })
    await settle()
  }
  /** 登入頁收到的 redirect 參數（照 URLSearchParams 解析）；不在登入頁時是 null */
  const loginRedirect = () => t.router.state.location.pathname === '/login'
    ? new URLSearchParams(t.router.state.location.search).get('redirect')
    : null
  return { ...t, auth, api, record, go, loginRedirect }
}

describe('練習 3：middleware 守衛與權限', () => {
  test('沒登入進 /admin/orders：導到登入頁並帶上原本的網址，頁面和 loader 都沒執行', async () => {
    const { api, record, loginRedirect } = await open(null, '/admin/orders?status=ready&page=2')
    expect(screen.queryByRole('heading', { name: '登入頁' }), '沒登入要被導到 /login').not.toBeNull()
    expect(loginRedirect(), '要導到 /login?redirect=<原本的路徑和查詢字串>，redirect 的值要用 URLSearchParams 編碼：直接把 ?status=ready&page=2 接在後面，&page=2 會變成 /login 自己的參數').toBe('/admin/orders?status=ready&page=2')
    expect(api.callsOf('getOrders').length, '沒登入卻已經呼叫了 api.getOrders：守衛要在 loader 之前擋下。父路由的 loader 和子路由的 loader 是同時跑的，擋不住子路由；用 /admin 的 middleware').toBe(0)
    expect(record.everShown('後台選單'), '沒登入時後台的畫面一次都不能出現：在 effect 裡 navigate 時，畫面已經先 render 過了').toBe(false)
    record.stop()
  })

  test('沒登入進 /admin（沒有 loader 的頁面）也被擋下', async () => {
    const { record, loginRedirect } = await open(null, '/admin')
    expect(loginRedirect(), '/admin 的總覽沒有 loader，也要被擋下並導到 /login?redirect=%2Fadmin：守衛放在 /admin 這一層，不是只放在有 loader 的子頁面').toBe('/admin')
    expect(record.everShown('後台總覽'), '後台總覽一次都不能出現').toBe(false)
    record.stop()
  })

  test('被導去登入頁後按上一頁，回到進後台之前的頁面', async () => {
    const { go, loginRedirect } = await open(null, '/')
    await go('/admin/orders')
    expect(loginRedirect(), '沒登入進 /admin/orders 要被導到登入頁').toBe('/admin/orders')
    await go(-1)
    expect(currentUrl(), '按上一頁要回到首頁：被擋下的 /admin/orders 不能留在歷史紀錄裡（在 loader 之前 throw redirect，不要先進頁面再 navigate）').toBe('/')
  })

  test('店員進 /admin/orders：用自己門市的編號抓訂單', async () => {
    const { api } = await open(BARISTA, '/admin/orders')
    expect(api.callsOf('getOrders').map(c => c.args), '要呼叫 api.getOrders(登入者的 storeId)：陳美華是 2 號店').toEqual([[2]])
    expect(api.callsOf('getOrders')[0].signal, '要傳 { signal: request.signal }').toBeInstanceOf(AbortSignal)
    expect(screen.queryByRole('heading', { name: '訂單列表' }), '登入後要看得到訂單列表').not.toBeNull()
    expect(screen.queryByText('張雅婷 $110'), '要列出 2 號店的訂單').not.toBeNull()
  })

  test('店員進 /admin/prices：顯示「沒有權限」，不抓價目表，不導去登入頁', async () => {
    const { api } = await open(BARISTA, '/admin/prices')
    expect(api.callsOf('getPrices').length, '店員沒有權限，不能呼叫 api.getPrices：在 prices 這一層加 middleware 檢查角色，在 loader 之前 throw').toBe(0)
    expect(currentUrl(), '403 是「知道你是誰，但你不能做」，導去登入頁沒有用：網址留在 /admin/prices').toBe('/admin/prices')
    expect(screen.queryByRole('alert')?.textContent, '要顯示 role="alert" 的「沒有權限」：throw data(\'沒有權限\', { status: 403 })，ErrorBoundary 用 isRouteErrorResponse 判斷 403').toContain('沒有權限')
    expect(screen.queryByText('測試頁首'), '錯誤只換掉後台這一塊，外層頁首要還在：ErrorBoundary 放在後台的路由上').not.toBeNull()
    expect(screen.queryByRole('heading', { name: '價目表' }), '沒有權限時不能顯示價目表').toBeNull()
  })

  test('店長進 /admin/prices：看得到價目表', async () => {
    const { api } = await open(MANAGER, '/admin/prices')
    expect(api.callsOf('getPrices').length, '店長可以看價目表').toBe(1)
    expect(screen.queryByRole('heading', { name: '價目表' })).not.toBeNull()
    expect(screen.queryByText('拿鐵 $110')).not.toBeNull()
  })

  test('每次導航都重新檢查：在後台登出後，點後台選單也會被導到登入頁', async () => {
    const { auth, user, loginRedirect } = await open(BARISTA, '/admin/orders')
    expect(screen.queryByRole('heading', { name: '訂單列表' })).not.toBeNull()
    auth.user = null   // 在別的分頁登出了
    await user.click(screen.getByRole('link', { name: '總覽' }))
    await settle()
    expect(loginRedirect(), '登出後點「總覽」要被導到 /login?redirect=%2Fadmin：父路由的 loader 在子頁面之間切換時不會重跑，守衛要放在每次導航都會執行的 middleware').toBe('/admin')
  })
})
