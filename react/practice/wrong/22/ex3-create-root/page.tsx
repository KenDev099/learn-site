import { renderToString } from 'react-dom/server'
import { createRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  const json = JSON.stringify(products).replace(/</g, '\\u003c')
  return `<div id="root">${html}</div><script type="application/json" id="menu-data">${json}</script>`
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  const products = JSON.parse(document.getElementById('menu-data')?.textContent ?? '[]') as Product[]
  const root = createRoot(container, options)   // 錯：丟掉伺服器的 DOM，整個重建
  root.render(<MenuPage products={products} />)
  return root
}
