import { useEffect, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'
import { fetchMenu } from './menu-api.ts'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  const json = JSON.stringify(products).replace(/</g, '\\u003c')
  return `<div id="root">${html}</div><script type="application/json" id="menu-data">${json}</script>`
}

function ClientMenu({ initial }: { initial: Product[] }) {
  const [products, setProducts] = useState(initial)
  useEffect(() => {
    fetchMenu().then(setProducts)   // 錯：資料已經在頁面裡，又抓一次
  }, [])
  return <MenuPage products={products} />
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  const products = JSON.parse(document.getElementById('menu-data')?.textContent ?? '[]') as Product[]
  return hydrateRoot(container, <ClientMenu initial={products} />, options)
}
