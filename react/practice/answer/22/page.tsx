import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import type { Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'

const DATA_ID = 'menu-data'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  // < 換成 <：JSON.parse 讀回來一樣是 <，但 HTML 解析器看不到 </script>
  const json = JSON.stringify(products).replace(/</g, '\\u003c')
  return `<div id="root">${html}</div><script type="application/json" id="${DATA_ID}">${json}</script>`
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  const products = JSON.parse(document.getElementById(DATA_ID)?.textContent ?? '[]') as Product[]
  return hydrateRoot(container, <MenuPage products={products} />, options)
}
