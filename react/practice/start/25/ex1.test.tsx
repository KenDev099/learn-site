import { describe, expect, test } from 'vitest'
import { screen, within } from '@testing-library/react'
import { MenuPage } from './features/menu/MenuPage.tsx'
import { createFakeShop, currentQuery, currentUrl, reject, renderApp, resolve, settle } from './test-utils.tsx'

async function open(...entries: string[]) {
  const shop = createFakeShop()
  const t = renderApp([{ path: 'menu', Component: () => <MenuPage api={shop.api} /> }], ...entries)
  await settle()
  return { ...t, shop }
}
const menu = () => screen.getByRole('region', { name: '菜單' })
const items = () => within(menu()).queryAllByRole('listitem').map(li => li.textContent).join('、')
const pressed = () => screen.getAllByRole('button', { pressed: true }).map(b => b.textContent).join('、')
const COFFEE = '美式咖啡 $80、拿鐵 $110、卡布奇諾 $110'
const TEA = '伯爵紅茶 $90'
const FOOD = '可頌 $70、起司蛋糕 $120'

describe('練習 1：菜單頁', () => {
  test('沒有 category：當成咖啡，第一次載入顯示載入中，成功後列出菜單', async () => {
    const { shop } = await open('/menu')
    expect(within(menu()).queryByRole('status'),'還沒有資料時要顯示 <p role="status">載入菜單中…</p>').toHaveTextContent('載入菜單中…')
    const calls = shop.callsOf('getCategory')
    expect(calls.map(c => c.args), '要呼叫 api.getCategory(\'coffee\', { signal }) 一次').toEqual([['coffee']])
    expect(calls[0].signal, 'queryFn 要把 TanStack Query 給的 signal 傳給 api.getCategory：換分類、離開頁面時才取消得了').toBeInstanceOf(AbortSignal)
    await resolve(calls[0])
    expect(items(), '成功後列出咖啡分類，每一項是「品名 $價格」').toBe(COFFEE)
    expect(pressed(), '選中的分類按鈕要 aria-pressed="true"').toBe('咖啡')
    expect(screen.queryByText('載入菜單中…'), '有資料之後載入訊息要消失').toBeNull()
  })

  test('分類從網址來；點分類只改 category、保留其他 query，並新增一筆歷史紀錄', async () => {
    const { shop, user, go } = await open('/menu?table=5&category=tea')
    expect(shop.callsOf('getCategory').map(c => c.args), '?category=tea 要抓茶：分類只存在網址，用 useSearchParams 讀，不要另外存一份 state').toEqual([['tea']])
    await resolve(shop.callsOf('getCategory')[0])
    expect(items()).toBe(TEA)
    await user.click(screen.getByRole('button', { name: '點心' }))
    await settle()
    expect(currentQuery(), '點「點心」之後網址要是 ?table=5&category=food：用 setSearchParams(prev => …) 只改 category，不要整個換掉（桌號會不見）').toEqual({ table: '5', category: 'food' })
    expect(pressed(), '點完之後「點心」是選中的').toBe('點心')
    await resolve(shop.pendingOf('getCategory')[0])
    expect(items()).toBe(FOOD)
    await go(-1)
    expect(currentQuery(), '按上一頁要回到 ?category=tea：換分類要新增歷史紀錄（不要用 replace）').toEqual({ table: '5', category: 'tea' })
    expect(items(), '回到看過的茶，要直接顯示快取的資料：queryKey 要包含分類，每個分類各存一份').toBe(TEA)
    expect(screen.queryByText('載入菜單中…'), '有快取時不能顯示載入中').toBeNull()
  })

  test('不合法或重複的 category 都當成咖啡', async () => {
    const a = await open('/menu?category=juice')
    expect(a.shop.callsOf('getCategory').map(c => c.args), '?category=juice 不是合法分類，要當成 coffee').toEqual([['coffee']])
    expect(pressed()).toBe('咖啡')
    a.unmount()
    const b = await open('/menu?category=tea&category=food')
    expect(b.shop.callsOf('getCategory').map(c => c.args), '?category 出現兩次（網址可以被亂改）要當成 coffee：用 getAll 檢查只有一個值').toEqual([['coffee']])
  })

  test('換分類時舊菜單留在畫面上，aria-busy 是 true，新資料到了才換', async () => {
    const { shop, user } = await open('/menu')
    await resolve(shop.callsOf('getCategory')[0])
    await user.click(screen.getByRole('button', { name: '茶' }))
    await settle()
    expect(shop.callsOf('getCategory').map(c => c.args), '換到茶要抓茶：queryKey 要包含分類，不然 TanStack Query 以為是同一份資料').toEqual([['coffee'], ['tea']])
    expect(screen.queryByText('載入菜單中…'), '換分類時不要把整個菜單換成「載入菜單中…」：用 placeholderData: keepPreviousData 留著上一個分類').toBeNull()
    expect(items(), '等待時畫面上留著咖啡').toBe(COFFEE)
    expect(menu(), '畫面上的資料是舊的時候，<section aria-label="菜單"> 要 aria-busy="true"：用 isPlaceholderData 判斷').toHaveAttribute('aria-busy', 'true')
    await resolve(shop.callsOf('getCategory')[1])
    expect(items(), '茶的資料到了就換掉').toBe(TEA)
    expect(menu(), '換完之後 aria-busy 回到 "false"').toHaveAttribute('aria-busy', 'false')
  })

  test('失敗時顯示錯誤與重試，按重試重新抓', async () => {
    const { shop, user } = await open('/menu')
    await reject(shop.callsOf('getCategory')[0])
    expect(screen.queryByRole('alert'), '失敗要顯示 <p role="alert">菜單載入失敗</p>：只寫成功的情況，客人會一直看到空白或載入中').toHaveTextContent('菜單載入失敗')
    expect(screen.queryByText('載入菜單中…'), '失敗之後不能還顯示載入中').toBeNull()
    await user.click(screen.getByRole('button', { name: '重試' }))
    await settle()
    expect(shop.callsOf('getCategory'), '按「重試」要再抓一次（refetch）').toHaveLength(2)
    await resolve(shop.callsOf('getCategory')[1])
    expect(items(), '重試成功後列出菜單').toBe(COFFEE)
    expect(screen.queryByRole('alert'), '成功之後錯誤訊息要消失').toBeNull()
  })

  test('搜尋只篩選畫面，不進網址、不再呼叫 API', async () => {
    const { shop, user } = await open('/menu?category=coffee')
    await resolve(shop.callsOf('getCategory')[0])
    await user.type(screen.getByLabelText('搜尋商品'), ' 拿 ')
    expect(items(), '關鍵字去掉前後空白後篩選品名：只剩拿鐵').toBe('拿鐵 $110')
    expect(currentUrl(), '關鍵字是打字中的暫時狀態，不要寫進網址：每打一個字都會多一筆歷史紀錄').toBe('/menu?category=coffee')
    expect(shop.callsOf('getCategory'), '篩選目前分類已經抓到的資料，不用再呼叫 API').toHaveLength(1)
    await user.clear(screen.getByLabelText('搜尋商品'))
    await user.type(screen.getByLabelText('搜尋商品'), '紅茶')
    expect(within(menu()).queryByText('找不到符合的商品'), '篩完沒有東西要顯示「找不到符合的商品」').not.toBeNull()
    expect(within(menu()).queryByRole('list'), '沒有結果時不要留一個空的 <ul>').toBeNull()
  })
})
