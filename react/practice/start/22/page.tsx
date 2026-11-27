/*
練習 3：把伺服器抓到的資料交給瀏覽器（page.tsx）
問題：
  伺服器 render 菜單時已經有商品資料，HTML 裡也有完整的清單；
  但瀏覽器 hydrate 時手上沒有資料，先用空陣列 render（跟伺服器的 HTML 不一樣），再呼叫 fetchMenu() 抓一次。
  結果是 hydration 錯誤、畫面閃一下、同一份菜單抓兩次。
要求：
  1. renderPage(products)（伺服器執行）回傳兩段 HTML，接在一起：
     - <div id="root">…</div>：MenuPage 的 HTML
     - <script type="application/json" id="menu-data">…</script>：同一份 products 的 JSON
     JSON 放進 <script> 前要跳脫：商品名稱裡有 </script> 也不能提早結束這個標籤（把 < 換成 <）
  2. hydratePage(container, options)（瀏覽器執行）從 #menu-data 讀出 products，用同一份資料 hydrateRoot，
     options 原樣交給 hydrateRoot；hydration 沒有錯誤，也不再呼叫 fetchMenu()
  3. 要用 hydrateRoot 接手伺服器的 DOM（不能用 createRoot 重建），hydrate 之後按「加入X」要能累計件數
不能做的事：
  - 不要改 MenuPage.tsx、menu-api.ts、ssr-utils.tsx
  - 實際專案會分成伺服器和瀏覽器兩個進入點；這裡為了測試方便寫在同一個檔案
*/
import { useEffect, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'
import { fetchMenu } from './menu-api.ts'

export function renderPage(products: readonly Product[]): string {
  return `<div id="root">${renderToString(<MenuPage products={products} />)}</div>`
}

function ClientMenu() {
  const [products, setProducts] = useState<Product[]>([])
  useEffect(() => {
    fetchMenu().then(setProducts)
  }, [])
  return <MenuPage products={products} />
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  return hydrateRoot(container, <ClientMenu />, options)
}
