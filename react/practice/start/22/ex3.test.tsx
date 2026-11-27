import { describe, expect, test, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { hydratePage, renderPage } from './page.tsx'
import { collectHydration, onServer, summary } from './ssr-utils.tsx'

// 數瀏覽器呼叫了幾次 fetchMenu
const api = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./menu-api.ts', async importOriginal => {
  const mod = await importOriginal<typeof import('./menu-api.ts')>()
  return { fetchMenu: () => { api.calls++; return mod.fetchMenu() } }
})

const special: Product = { id: 7, name: '</script><script>alert("x")</script>桂花拿鐵', price: 130, category: 'coffee' }
const menu: Product[] = [...structuredClone(PRODUCTS) as Product[], special]

/** 模擬瀏覽器收到伺服器的 HTML：放進 body，再呼叫 hydratePage */
async function loadInBrowser(products: Product[]) {
  const html = onServer(() => renderPage(products))
  document.body.innerHTML = html
  const container = document.getElementById('root')!
  const firstItem = container.querySelector('li')
  api.calls = 0
  const report = await collectHydration(options => hydratePage(container, options))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })   // 讓 effect 裡的請求有機會跑完
  return { html, container, firstItem, report }
}
const names = () => within(screen.getByRole('list', { name: '菜單' })).getAllByRole('listitem').map(li => [...li.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(''))

describe('練習 3：伺服器的資料交給瀏覽器', () => {
  test('伺服器的 HTML 已經有完整的菜單和資料', () => {
    const html = onServer(() => renderPage(menu))
    const doc = Object.assign(document.createElement('div'), { innerHTML: html })
    const root = doc.querySelector('#root')
    expect(root, '要有 <div id="root">，裡面是 MenuPage 的 HTML').not.toBeNull()
    expect(root!.querySelectorAll('li'), '伺服器的 HTML 要有 7 個商品').toHaveLength(7)
    const data = doc.querySelector('script#menu-data')
    expect(data, '要有 <script type="application/json" id="menu-data">，放同一份 products 的 JSON').not.toBeNull()
    expect(data!.getAttribute('type')).toBe('application/json')
  })

  test('商品名稱裡有 </script> 也不會提早結束標籤', () => {
    const html = onServer(() => renderPage(menu))
    const doc = Object.assign(document.createElement('div'), { innerHTML: html })
    expect(doc.querySelectorAll('script'), `HTML 裡多出了 <script>：名稱裡的 </script> 把資料標籤提早結束了，後面的字變成另一段會執行的程式（XSS）。JSON 放進 <script> 前把 < 換成 \\u003c`).toHaveLength(1)
    expect(html, 'JSON 裡不能出現原樣的 </script').not.toMatch(/<\/script>.*<\/script>/s)
    expect(JSON.parse(doc.querySelector('#menu-data')!.textContent!), 'JSON.parse 讀回來要跟原本的 products 一模一樣（用 \\u003c，不要換成 &lt;：script 裡的內容不會解碼 HTML 實體）').toEqual(menu)
  })

  test('hydration 沒有錯誤，也不再抓一次菜單', async () => {
    const { report } = await loadInBrowser(menu)
    expect(summary(report), '有 hydration 錯誤：瀏覽器第一次 render 要用跟伺服器同一份 products。從 #menu-data 讀出來，不要先用空陣列再抓').toBe('')
    expect(api.calls, '資料已經在頁面裡了，瀏覽器不要再呼叫 fetchMenu()').toBe(0)
    expect(names(), '畫面要是同一份菜單').toEqual(menu.map(p => `${p.name} $${p.price}`))
  })

  test('用 hydrateRoot 接手伺服器的 DOM，之後按鈕能用', async () => {
    const { container, firstItem } = await loadInBrowser(menu)
    expect(container.querySelector('li'), '第一個 <li> 已經不是伺服器的那個節點：createRoot 會丟掉伺服器的 HTML 重建。用 hydrateRoot 接手').toBe(firstItem)
    fireEvent.click(screen.getByRole('button', { name: '加入拿鐵' }))
    fireEvent.click(screen.getByRole('button', { name: '加入可頌' }))
    expect(screen.getByRole('status'), 'hydrate 之後按鈕要能用').toHaveTextContent('購物車 2 件')
  })

  test('換一份菜單也照樣交接', async () => {
    const other: Product[] = [{ id: 11, name: '冰美式', price: 85, category: 'coffee' }]
    const { report } = await loadInBrowser(other)
    expect(summary(report), '換了菜單也要沒有 hydration 錯誤：不要寫死商品').toBe('')
    expect(names()).toEqual(['冰美式 $85'])
    expect(api.calls).toBe(0)
  })
})
