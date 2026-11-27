import { useLayoutEffect } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMenu, type MenuApi } from './useMenu.ts'
import { createFakeMenuApi, PRODUCTS } from '../../helpers/fake-api.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'

type Commit = { keyword: string; loading: boolean; names: string[] }
const ALL = PRODUCTS.map(p => p.name)

// commits 記下每一次真的更新到畫面（commit）時 hook 回傳了什麼
function setup(keyword = '', wrap: (api: MenuApi) => MenuApi = api => api) {
  const fake = createFakeMenuApi({ manual: true })
  const api = wrap(fake)
  const commits: Commit[] = []
  const view = renderHook(({ keyword }) => {
    const menu = useMenu(api, keyword)
    useLayoutEffect(() => {
      commits.push({ keyword, loading: menu.loading, names: menu.products.map(p => p.name) })
    })
    return menu
  }, { initialProps: { keyword } })
  const calls = () => fake.callsOf('search')
  const names = () => view.result.current.products.map(p => p.name)
  const search = (keyword: string) => view.rerender({ keyword })
  /** 讓第 i 次呼叫完成（或失敗），並等 React 更新完 */
  const settle = (i: number, how: 'resolve' | 'reject' = 'resolve', value?: unknown) => act(async () => { calls()[i][how](value) })
  return { ...view, commits, calls, names, search, settle }
}

describe('練習 4：useMenu', () => {
  test('掛載時載入：loading 從 true 變 false，products 是查到的商品', async () => {
    const { result, calls, names, settle } = setup('')
    expect(calls().map(c => c.args), '掛載時要呼叫 api.search(keyword, { signal })').toEqual([['']])
    expect(calls()[0].signal, 'api.search 的第二個參數要傳 { signal }：signal 來自 AbortController').toBeInstanceOf(AbortSignal)
    expect(result.current.loading, '結果還沒回來，loading 要是 true').toBe(true)
    expect(result.current.error, '還沒失敗，error 要是 null').toBe(null)
    await settle(0)
    expect(result.current.loading, '結果回來了，loading 要是 false').toBe(false)
    expect(names(), 'products 要是 api.search 回傳的商品').toEqual(ALL)
  })

  test('請求失敗：error 是那個錯誤，loading 變 false', async () => {
    const { result, settle } = setup('')
    await settle(0, 'reject', new Error('伺服器忙線中'))
    expect(result.current.error?.message, '請求失敗時 error 要是 api 丟出的 Error').toBe('伺服器忙線中')
    expect(result.current.loading, '失敗也算載入結束，loading 要是 false').toBe(false)
  })

  test('keyword 改變時重新查詢', async () => {
    const { result, calls, names, search, settle } = setup('')
    await settle(0)
    search('茶')
    expect(calls().map(c => c.args), 'keyword 從「」換成「茶」，要再呼叫 api.search("茶")：keyword 要在 effect 的依賴陣列裡').toEqual([[''], ['茶']])
    expect(result.current.loading, '新的 keyword 的結果還沒回來，loading 要回到 true').toBe(true)
    await settle(1)
    expect(names(), '要顯示「茶」的查詢結果').toEqual(['伯爵紅茶'])
    expect(result.current.loading).toBe(false)
  })

  test('keyword 一換，畫面上不會出現「新的 keyword 配舊的結果」', async () => {
    const { commits, search, settle } = setup('')
    await settle(0)
    search('茶')
    const stale = commits.filter(c => c.keyword === '茶' && !c.loading)
    expect(stale, 'keyword 已經是「茶」的那次畫面，loading 還是 false、products 還是全部商品。在 effect 裡 setLoading(true) 會晚一次 render；把 loading 寫成衍生值：記下結果是哪一次請求的，render 時比對是不是目前這一次').toEqual([])
    await settle(1)
    expect(commits.at(-1), '結果回來後的畫面').toEqual({ keyword: '茶', loading: false, names: ['伯爵紅茶'] })
  })

  test('keyword 改變時取消上一個請求，被取消不算錯誤', async () => {
    const { result, calls, names, search, settle } = setup('拿')
    search('茶')
    expect(calls()[0].signal?.aborted, 'keyword 換了，上一個請求的 signal 要被 abort：effect 的清理函式呼叫 controller.abort()').toBe(true)
    expect(calls()[1].signal?.aborted, '新的請求不能被取消：每次 effect 建立自己的 AbortController').toBe(false)
    await act(async () => {})   // 被取消的請求以 AbortError 失敗
    expect(result.current.error, '被取消的請求會以 AbortError 失敗，那不是要給使用者看的錯誤：signal.aborted 時不要更新 state').toBe(null)
    expect(result.current.loading, '「茶」的結果還沒回來，loading 要是 true').toBe(true)
    await settle(1)
    expect(names()).toEqual(['伯爵紅茶'])
    expect(result.current.error).toBe(null)
  })

  test('API 不理會 signal 時，過期的回應也不能蓋掉新的結果', async () => {
    // 這個 api 收到 signal 但不會因為 abort 而失敗：舊的請求照樣會成功回來
    const ignoreSignal = (api: MenuApi): MenuApi => ({ search: keyword => api.search(keyword) })
    const { result, names, search, settle } = setup('拿', ignoreSignal)
    search('茶')
    await settle(0)   // 舊的「拿」先回來
    expect(result.current.loading && names().length === 0 || names().join() === '伯爵紅茶', '「拿」的結果回來時 keyword 已經是「茶」：這份結果過期了，不能當成目前的結果顯示').toBe(true)
    await settle(1)
    expect(names(), '「茶」的結果回來後要顯示伯爵紅茶').toEqual(['伯爵紅茶'])

    search('可')
    search('蛋糕')
    await settle(3)   // 新的「蛋糕」先回來
    await settle(2)   // 舊的「可」比較晚回來
    expect(names(), '「可」（舊請求）比「蛋糕」晚回來，畫面卻變成可頌，或卡在載入中：收到回應時先檢查 signal.aborted（或清理函式設的旗標），過期就丟掉').toEqual(['起司蛋糕'])
    expect(result.current.loading, '最新的結果已經回來，loading 要是 false').toBe(false)
  })

  test('卸載時取消請求', async () => {
    const { calls, unmount } = setup('')
    unmount()
    expect(calls()[0].signal?.aborted, '元件卸載時要 abort 還沒回來的請求').toBe(true)
  })

  test('reload() 用同一個 keyword 重新查，並清掉上次的錯誤', async () => {
    const { result, calls, names, settle } = setup('茶')
    await settle(0, 'reject', new Error('伺服器忙線中'))
    act(() => result.current.reload())
    expect(calls().map(c => c.args), 'reload() 要用目前的 keyword 再呼叫一次 api.search').toEqual([['茶'], ['茶']])
    expect(result.current.loading, 'reload() 之後 loading 要回到 true').toBe(true)
    expect(result.current.error, 'reload() 之後要清掉上次的錯誤').toBe(null)
    await settle(1)
    expect(names(), '重新載入成功後顯示結果').toEqual(['伯爵紅茶'])
    expect(result.current.error).toBe(null)
  })

  test('換 keyword 之後清掉上次的錯誤', async () => {
    const { result, search, settle } = setup('茶')
    await settle(0, 'reject', new Error('伺服器忙線中'))
    search('拿')
    expect(result.current.error, '「茶」的錯誤不屬於「拿」這次查詢，要清掉').toBe(null)
    await settle(1)
    expect(result.current.error).toBe(null)
  })

  test('reload 的參考穩定', async () => {
    const { result, rerender, settle } = setup('')
    const first = result.current.reload
    await settle(0)
    rerender({ keyword: '' })
    expect(result.current.reload, '每次 render 的 reload 都是新的函式：使用的人把它放進 effect 的依賴陣列時，effect 會每次都重跑。用 useCallback 包起來，裡面用 updater function 就不需要依賴').toBe(first)
  })

  test('react-hooks 的 lint 規則通過，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'useMenu.ts')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉規則').not.toMatch(/eslint-disable/)
    const problems = await lintHooks(file)
    expect(problems.map(p => `第 ${p.line} 行 ${p.rule}：${p.message}`), 'effect 用到的 api、keyword 都要列在依賴陣列').toEqual([])
  }, 30_000)
})
