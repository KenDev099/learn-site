import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  const json = JSON.stringify(products).replace(/</g, '&lt;')   // 錯：script 的內容不會解碼 HTML 實體，讀回來名稱變了
  return `<div id="root">${html}</div><script type="application/json" id="menu-data">${json}</script>`
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  const products = JSON.parse(document.getElementById('menu-data')?.textContent ?? '[]') as Product[]
  return hydrateRoot(container, <MenuPage products={products} />, options)
}
