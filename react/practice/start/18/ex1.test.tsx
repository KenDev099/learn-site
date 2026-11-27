import { describe, expect, test } from 'vitest'
import { screen, within } from '@testing-library/react'
import { routes } from './routes.tsx'
import { renderRoutes } from './test-utils.tsx'

const main = () => screen.getByRole('main')
const adminSection = () => {
  const nav = screen.queryByRole('navigation', { name: '後台選單' })
  expect(nav, '後台的頁面要顯示 AdminLayout 的後台選單：/admin 這條路由用 AdminLayout，子路由放在它的 children').not.toBeNull()
  const section = nav!.parentElement!.querySelector('section')
  expect(section, 'AdminLayout 的 <section> 不見了').not.toBeNull()
  return section!
}

describe('練習 1：巢狀路由與版面', () => {
  test('/ 顯示頁首和首頁，首頁在 <main> 裡', () => {
    renderRoutes(routes, '/')
    expect(screen.getByRole('navigation', { name: '主選單' }), '頁首的主選單要一直在').toBeInTheDocument()
    expect(within(main()).queryByRole('heading', { name: '歡迎光臨' }), '/ 要在 Layout 的 <main> 裡顯示 Home：在 <main> 裡放 <Outlet />，Home 用 index: true 的子路由').not.toBeNull()
  })

  test('/menu 和 /menu/:id 顯示在 <main> 裡', () => {
    renderRoutes(routes, '/menu')
    expect(within(main()).queryByRole('heading', { name: '菜單' }), '/menu 要在 <main> 裡顯示 MenuPage：path 寫 "menu"，放在 "/" 的 children').not.toBeNull()
  })

  test('/menu/5 的 ProductPage 讀到 id', () => {
    renderRoutes(routes, '/menu/5')
    expect(within(main()).queryByRole('heading', { name: '商品 #5' }), '/menu/5 要顯示「商品 #5」：path 寫 "menu/:id"，ProductPage 用 useParams 讀 id').not.toBeNull()
  })

  test('/admin 顯示後台選單和後台總覽', () => {
    renderRoutes(routes, '/admin')
    expect(within(main()).queryByRole('navigation', { name: '後台選單' }), '/admin 要在 <main> 裡顯示 AdminLayout：它是 "/" 的子路由，也是一層版面').not.toBeNull()
    expect(within(adminSection()).queryByRole('heading', { name: '後台總覽' }), '/admin 要在後台的 <section> 裡顯示 AdminHome：AdminLayout 的 <section> 放 <Outlet />，AdminHome 用 index: true').not.toBeNull()
  })

  test('/admin/orders 顯示後台選單和訂單管理，不顯示後台總覽', () => {
    renderRoutes(routes, '/admin/orders')
    expect(within(adminSection()).queryByRole('heading', { name: '訂單管理' }), '/admin/orders 要在後台的 <section> 裡顯示 OrdersPage：path 寫 "orders"（不要以 / 開頭），放在 admin 的 children').not.toBeNull()
    expect(screen.queryByRole('heading', { name: '後台總覽' }), 'AdminHome 只在 /admin 顯示：用 index: true，不要直接寫在 AdminLayout 裡').toBeNull()
  })

  test('找不到的網址顯示 NotFound，頁首還在', () => {
    renderRoutes(routes, '/coupon')
    expect(screen.queryByRole('heading', { name: '找不到頁面' }), '其他網址要顯示 NotFound：在 "/" 的 children 加 path: "*"').not.toBeNull()
    expect(screen.queryByRole('navigation', { name: '主選單' }), '找不到頁面時頁首也要在：path "*" 要放在 Layout 底下，不是跟 "/" 平行').not.toBeNull()
  })

  test('/admin/nope 也顯示 NotFound', () => {
    renderRoutes(routes, '/admin/nope')
    expect(screen.queryByRole('heading', { name: '找不到頁面' }), '/admin/nope 對不到任何子路由，要落到 "*"').not.toBeNull()
    expect(screen.queryByRole('heading', { name: '後台總覽' }), '/admin/nope 不是 /admin').toBeNull()
  })

  test('換頁時頁首不重建：搜尋草稿打的字還在', async () => {
    const { user } = renderRoutes(routes, '/')
    const header = screen.getByRole('banner')
    await user.type(screen.getByLabelText('搜尋草稿'), '拿鐵')
    await user.click(screen.getByRole('link', { name: '菜單' }))
    expect(within(main()).queryByRole('heading', { name: '菜單' }), '點「菜單」要換到菜單頁').not.toBeNull()
    await user.click(screen.getByRole('link', { name: '今日推薦' }))
    expect(within(main()).queryByRole('heading', { name: '商品 #2' }), '點「今日推薦」要換到 /menu/2').not.toBeNull()
    expect(screen.getByRole('banner'), '換頁時頁首被重新建立了：Layout 要是外層路由的元件，頁面放在它的 <Outlet />，不要每一頁各包一次 Layout').toBe(header)
    expect(screen.getByLabelText('搜尋草稿'), '換頁後搜尋草稿打的字不見了：版面被重建，裡面的 state 也跟著重來').toHaveValue('拿鐵')
  })

  test('後台兩頁之間切換，後台選單不重建', async () => {
    const { user } = renderRoutes(routes, '/admin')
    const nav = screen.getByRole('navigation', { name: '後台選單' })
    await user.click(screen.getByRole('link', { name: '訂單' }))
    expect(screen.queryByRole('heading', { name: '訂單管理' }), '點「訂單」要換到 /admin/orders').not.toBeNull()
    expect(screen.getByRole('navigation', { name: '後台選單' }), '後台選單被重新建立了：orders 要是 admin 的子路由，顯示在 AdminLayout 的 <Outlet />').toBe(nav)
    await user.click(screen.getByRole('link', { name: '總覽' }))
    expect(screen.queryByRole('heading', { name: '後台總覽' }), '點「總覽」要回到 /admin').not.toBeNull()
  })
})
