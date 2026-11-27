import { describe, expect, test } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { createFakeMenuApi } from '../../helpers/fake-api.ts'
import { menuRoute } from './MenuSearch.tsx'
import { currentUrl, renderRoutes, settle, withShell } from './test-utils.tsx'

function open(url: string) {
  const api = createFakeMenuApi({ manual: true })
  const t = renderRoutes(withShell([{ path: 'menu', ...menuRoute(api) }]), url)
  const finish = async (method: 'getMenu' | 'search', i: number) => {
    const call = api.callsOf(method)[i]
    expect(call, `第 ${i + 1} 次 api.${method} 沒有被呼叫`).toBeDefined()
    await act(async () => { call.resolve() })
    await settle()
  }
  const input = () => screen.getByLabelText('搜尋商品') as HTMLInputElement
  const search = async (text: string) => {
    await t.user.clear(input())
    await t.user.type(input(), text)
    await t.user.click(screen.getByRole('button', { name: '搜尋' }))
    await settle()
  }
  const names = () => screen.queryAllByRole('listitem').map(li => li.textContent)
  const updating = () => screen.queryAllByRole('status').some(e => e.textContent?.includes('更新中…'))
  const back = async () => {
    await act(async () => { void t.router.navigate(-1) })
    await settle()
  }
  return { ...t, api, finish, input, search, names, updating, back }
}

describe('練習 4：loader 讀 ?q=，<Form> 送出，useNavigation 顯示更新中', () => {
  test('/menu：loader 抓整份菜單，抓完才顯示', async () => {
    const { api, finish, names } = open('/menu')
    expect(screen.queryByText('準備中…'), '資料要在 loader 裡抓：路由等 loader 完成才顯示頁面（測試的外層這時顯示「準備中…」）').not.toBeNull()
    expect(api.callsOf('getMenu').length, '沒有 q 時要呼叫 api.getMenu').toBe(1)
    expect(api.callsOf('getMenu')[0].signal, '要傳 { signal: request.signal }').toBeInstanceOf(AbortSignal)
    expect(api.callsOf('search').length, '沒有 q 時不要呼叫 api.search').toBe(0)
    await finish('getMenu', 0)
    expect(names(), '要用 <ul><li> 列出所有商品的品名').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
  })

  test('/menu?q= 有前後空白：去掉空白再搜尋，輸入框顯示 q', async () => {
    const { api, finish, names, input } = open('/menu?q=%20拿%20')
    expect(api.callsOf('search').map(c => c.args), '?q=%20拿%20 要去掉前後空白，呼叫 api.search("拿")').toEqual([['拿']])
    await finish('search', 0)
    expect(names()).toEqual(['拿鐵'])
    expect(input().value, '輸入框要顯示目前搜尋的字（loader 回傳去掉空白後的 q，當成輸入框的預設值）').toBe('拿')
  })

  test('/menu?q=%20%20：只有空白時當成沒有 q，抓整份菜單', async () => {
    const { api } = open('/menu?q=%20%20')
    expect(api.callsOf('search').length, '只有空白的 q 去掉空白後是空字串，要呼叫 api.getMenu').toBe(0)
    expect(api.callsOf('getMenu').length).toBe(1)
  })

  test('沒有結果時顯示「沒有符合的商品」', async () => {
    const { finish } = open('/menu?q=抹茶')
    await finish('search', 0)
    expect(screen.queryByText('沒有符合的商品')).not.toBeNull()
  })

  test('送出搜尋：網址變成 ?q=…，等待時保留舊清單並顯示「更新中…」', async () => {
    const { api, finish, search, names, updating } = open('/menu')
    await finish('getMenu', 0)
    expect(updating(), '沒有在載入時不要顯示「更新中…」').toBe(false)
    await search('茶')
    expect(screen.queryByRole('search'), '搜尋表單要是 role="search" 的 <Form>').not.toBeNull()
    expect(api.callsOf('search').map(c => c.args), '按「搜尋」要讓 loader 用新的 q 再跑一次：用 React Router 的 <Form>（預設 GET），輸入框 name="q"').toEqual([['茶']])
    expect(names(), '新結果還沒回來時要保留目前的清單，不要換成載入畫面').toHaveLength(6)
    expect(updating(), '等待新結果時要顯示 role="status" 的「更新中…」：用 useNavigation().state').toBe(true)
    await finish('search', 0)
    expect(currentUrl(), 'loader 完成後網址要變成 /menu?q=茶').toBe('/menu?q=茶')
    expect(names(), '新結果回來後換成伯爵紅茶').toEqual(['伯爵紅茶'])
    expect(updating(), '回來後「更新中…」要消失').toBe(false)
  })

  test('按上一頁：結果和輸入框都回到上一次的搜尋', async () => {
    const { finish, search, names, input, back } = open('/menu?q=拿')
    await finish('search', 0)
    await search('可頌')
    await finish('search', 1)
    expect(names()).toEqual(['可頌'])
    await back()
    await finish('search', 2)
    expect(currentUrl(), '送出搜尋要新增一筆歷史紀錄，按上一頁回到 ?q=拿').toBe('/menu?q=拿')
    expect(names(), '回到 ?q=拿，清單要是拿鐵：清單從 useLoaderData 讀，不要另外存 state').toEqual(['拿鐵'])
    expect(input().value, '回到 ?q=拿，輸入框也要顯示「拿」：defaultValue 只在第一次 render 有用，給輸入框 key={q}，q 變了就重建').toBe('拿')
  })

  test('快速搜尋兩次：第一次還沒回來的請求被取消', async () => {
    const { api, finish, search, names } = open('/menu')
    await finish('getMenu', 0)
    await search('拿')
    await search('茶')
    const calls = api.callsOf('search')
    expect(calls.map(c => c.args)).toEqual([['拿'], ['茶']])
    expect(calls[0].signal?.aborted, '第二次搜尋開始時，第一次的請求要被取消：把 request.signal 傳給 api.search').toBe(true)
    await finish('search', 1)
    expect(names()).toEqual(['伯爵紅茶'])
    expect(within(screen.getByRole('search')).getByLabelText('搜尋商品')).toHaveValue('茶')
  })
})
