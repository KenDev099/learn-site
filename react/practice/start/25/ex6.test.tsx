import { describe, expect, test, vi } from 'vitest'
import { useEffect } from 'react'
import { cleanup } from '@testing-library/react'
import { data, isRouteErrorResponse, redirect, useLocation, useNavigate, useParams, useRouteError, type MiddlewareFunction } from 'react-router'
import { checkStaffGuard, type MakeRoute } from './ex6.checks.tsx'
import type { Auth } from './shared/api.ts'

const Board = () => <h1>店員看板</h1>

// 正確版本 A：middleware（練習 4 的寫法）
const correctA: MakeRoute = auth => {
  const guard: MiddlewareFunction = ({ url, params }) => {
    const user = auth.user
    if (!user) throw redirect(`/login?${new URLSearchParams({ redirect: url.pathname + url.search })}`)
    if (user.role === 'customer' || String(user.storeId) !== params.storeId) throw data('沒有權限', { status: 403 })
  }
  function Forbidden() {
    const error = useRouteError()
    return <p role="alert">{isRouteErrorResponse(error) ? error.data : '錯誤'}</p>
  }
  return { path: 'staff/:storeId', middleware: [guard], Component: Board, ErrorBoundary: Forbidden }
}

// 正確版本 B：用 loader 擋（這個路由底下沒有別的 loader），文字和標記都不同
const correctB: MakeRoute = auth => ({
  path: 'staff/:storeId',
  loader: ({ request, params }) => {
    const user = auth.user
    const url = new URL(request.url)
    if (!user) return redirect(`/login?redirect=${encodeURIComponent(url.pathname + url.search)}`)
    const allowed = (user.role === 'barista' || user.role === 'manager') && user.storeId === Number(params.storeId)
    if (!allowed) throw data(null, { status: 403 })
    return null
  },
  Component: () => <main><Board /><p>今天 3 筆訂單</p></main>,
  ErrorBoundary: () => <div role="alert"><strong>你不能查看這間門市</strong></div>,
})

// 錯誤版本：從正確版本 A 改一個地方
function variant(opts: { noRedirectParam?: boolean; allowCustomer?: boolean; anyStore?: boolean; forbiddenToLogin?: boolean; strictTypes?: boolean }): MakeRoute {
  return (auth: Auth) => {
    const guard: MiddlewareFunction = ({ url, params }) => {
      const user = auth.user
      if (!user) throw redirect(opts.noRedirectParam ? '/login' : `/login?${new URLSearchParams({ redirect: url.pathname + url.search })}`)
      const denied = (!opts.allowCustomer && user.role === 'customer') || (!opts.anyStore && user.role !== 'customer' && (opts.strictTypes ? (user.storeId as unknown) !== params.storeId : String(user.storeId) !== params.storeId))
      if (denied) throw opts.forbiddenToLogin ? redirect('/login') : data('沒有權限', { status: 403 })
    }
    return { path: 'staff/:storeId', middleware: [guard], Component: Board, ErrorBoundary: () => <p role="alert">沒有權限</p> }
  }
}

// 錯誤版本：在元件裡用 effect 擋，看板會先 render 一次
const effectGuard: MakeRoute = auth => ({
  path: 'staff/:storeId',
  Component: function Guarded() {
    const navigate = useNavigate()
    const location = useLocation()
    const { storeId } = useParams()
    const user = auth.user
    const ok = user && user.role !== 'customer' && String(user.storeId) === storeId
    useEffect(() => {
      if (!user) void navigate(`/login?${new URLSearchParams({ redirect: location.pathname + location.search })}`, { replace: true })
    }, [navigate, user, location])
    if (user && !ok) return <p role="alert">沒有權限</p>
    return <Board />
  },
})

const WRONG: [string, MakeRoute][] = [
  ['沒登入時只導到 /login，沒有帶 redirect', variant({ noRedirectParam: true })],
  ['顧客也看得到看板', variant({ allowCustomer: true })],
  ['店員可以進別間門市', variant({ anyStore: true })],
  ['沒有權限時導去登入頁（不是 403）', variant({ forbiddenToLogin: true })],
  ['拿字串的 params.storeId 和數字的 user.storeId 用 !== 比，自己門市也進不去', variant({ strictTypes: true })],
  ['在元件裡用 effect 擋，看板先出現一次', effectGuard],
]

async function run(makeRoute: MakeRoute) {
  try {
    await checkStaffGuard(makeRoute)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  } finally {
    cleanup()
  }
}

describe('練習 6：守衛的檢查', () => {
  test('正確版本 A（middleware）要通過', async () => {
    const error = await run(correctA)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}`).toBeNull()
  })

  test('正確版本 B（loader、文字不同）要通過', async () => {
    const error = await run(correctB)
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}。錯誤訊息的文字不固定，用 role 找；redirect 參數比對解碼後的值`).toBeNull()
  })

  for (const [name, makeRoute] of WRONG) {
    test(`要抓到錯誤版本：${name}`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = await run(makeRoute)
      expect(error, `「${name}」這個錯誤版本通過了你的檢查：補上能抓到它的情境`).not.toBeNull()
    })
  }
})
