import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router'
import { useMenuQuery } from './useMenuQuery.ts'
import { typecheck } from '../../helpers/typecheck.ts'

// 菜單頁：顯示 hook 回傳的值，按鈕呼叫 setCategory / setKeyword
function Menu() {
  const { category, keyword, setCategory, setKeyword } = useMenuQuery()
  return (
    <section aria-label="菜單">
      <p>分類：{category}</p>
      <p>關鍵字：「{keyword}」</p>
      <button type="button" onClick={() => setCategory('tea')}>只看茶</button>
      <button type="button" onClick={() => setCategory('food')}>只看點心</button>
      <button type="button" onClick={() => setCategory('all')}>全部</button>
      <button type="button" onClick={() => setKeyword('  可頌 ')}>搜尋可頌</button>
      <button type="button" onClick={() => setKeyword('   ')}>清除搜尋</button>
    </section>
  )
}
// 網址列與上一頁按鈕
function Browser() {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  return (
    <nav>
      <output aria-label="網址">{location.pathname}{location.search}</output>
      <output aria-label="導航方式">{type}</output>
      <button type="button" onClick={() => navigate(-1)}>上一頁</button>
      <Link to="/menu?category=coffee&q=拿">咖啡連結</Link>
    </nav>
  )
}
function open(...entries: string[]) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Browser />
      <Menu />
    </MemoryRouter>,
  )
}
const category = () => screen.getByText(/^分類：/).textContent!.replace('分類：', '')
const keyword = () => screen.getByText(/^關鍵字：/).textContent!.replace(/^關鍵字：「|」$/g, '')
const url = () => decodeURIComponent(screen.getByRole('status', { name: '網址' }).textContent!)
const query = () => Object.fromEntries(new URLSearchParams(url().split('?')[1] ?? ''))
const click = (name: string) => userEvent.setup().click(screen.getByRole('button', { name }))

describe('練習 2：篩選放進網址', () => {
  test('從網址讀出分類和關鍵字', () => {
    open('/menu?category=tea&q=%20%E6%8B%BF%E9%90%B5%20')
    expect(category(), '?category=tea 要讀成 tea：用 useSearchParams 讀網址，不要用 useState').toBe('tea')
    expect(keyword(), '?q= 要去掉前後空白').toBe('拿鐵')
  })

  test('沒有、不合法、重複的分類都當成 all', () => {
    open('/menu')
    expect(category(), '沒有 category 時是 all').toBe('all')
    expect(keyword(), '沒有 q 時是空字串').toBe('')
  })

  test('分類不在清單裡時是 all', () => {
    open('/menu?category=%3Cscript%3E')
    expect(category(), '網址是使用者可以亂改的外部輸入：只接受 coffee、tea、food，其他一律 all').toBe('all')
  })

  test('同一個鍵出現兩次時是 all', () => {
    open('/menu?category=tea&category=coffee')
    expect(category(), '?category=tea&category=coffee 有兩個值，不知道該用哪個：用 getAll 檢查，超過一個就當成 all（get 只會拿第一個）').toBe('all')
  })

  test('setCategory 寫進網址，保留其他鍵，用 replace', async () => {
    open('/', '/menu?q=拿&page=2&store=1')
    await click('只看茶')
    expect(category(), 'setCategory("tea") 之後要讀到 tea').toBe('tea')
    expect(url().split('?')[0], '路徑不能變').toBe('/menu')
    expect(query(), '要保留 q、page、store：用 setSearchParams(prev => { prev.set(…); return prev })，不要傳一個只有 category 的新物件').toEqual({ q: '拿', page: '2', store: '1', category: 'tea' })
    expect(screen.getByRole('status', { name: '導航方式' }), '篩選要用 replace：setSearchParams(…, { replace: true })').toHaveTextContent('REPLACE')
    await click('只看點心')
    await click('上一頁')
    expect(url(), '切換兩次分類後按上一頁，要直接回到進菜單之前的首頁（replace 不新增歷史紀錄）').toBe('/')
  })

  test('setCategory("all") 刪掉 category', async () => {
    open('/menu?category=tea&page=2')
    await click('全部')
    expect(category()).toBe('all')
    expect(query(), '選「全部」時要刪掉 category 這個鍵（delete），不要寫成 category=all').toEqual({ page: '2' })
  })

  test('setKeyword 去掉空白後寫入 q，空白時刪掉 q', async () => {
    open('/menu?category=food')
    await click('搜尋可頌')
    expect(query(), 'setKeyword("  可頌 ") 要寫入 q=可頌，並保留 category').toEqual({ category: 'food', q: '可頌' })
    expect(keyword()).toBe('可頌')
    await click('清除搜尋')
    expect(query(), '只有空白時要刪掉 q').toEqual({ category: 'food' })
    expect(keyword()).toBe('')
  })

  test('網址是唯一的來源：點連結、按上一頁，回傳值都跟著網址變', async () => {
    open('/menu?category=tea')
    await userEvent.setup().click(screen.getByRole('link', { name: '咖啡連結' }))
    expect(category(), '網址變成 ?category=coffee 時，category 要跟著變：不要把網址的值複製進 useState').toBe('coffee')
    expect(keyword()).toBe('拿')
    await click('上一頁')
    expect(category(), '按上一頁回到 ?category=tea，category 要變回 tea').toBe('tea')
    expect(keyword()).toBe('')
  })

  test('型別：category 是 MenuCategory，setCategory 只收 MenuCategory', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.ts': `
import { useMenuQuery, type MenuCategory } from './useMenuQuery.ts'
export function usage() {
  const q = useMenuQuery()
  const c: MenuCategory = q.category
  const k: string = q.keyword
  q.setCategory('coffee')
  q.setKeyword('拿鐵')
  // @ts-expect-error 'cake' 不是 MenuCategory
  q.setCategory('cake')
  // @ts-expect-error category 不能是 any 或 string
  const n: number = q.category
  return [c, k, n]
}
`,
    })
    expect(errors, 'category 的型別要是 MenuCategory（不是 string 或 any），setCategory 的參數也是').toBe('')
  }, 30000)
})
