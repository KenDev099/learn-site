import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  const json = JSON.stringify(products)   // 錯：名稱裡的 </script> 會提早結束標籤
  return `<div id="root">${html}</div><script type="application/json" id="menu-data">${json}</script>`
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  const products = JSON.parse(document.getElementById('menu-data')?.textContent ?? '[]') as Product[]
  return hydrateRoot(container, <MenuPage products={products} />, options)
}
