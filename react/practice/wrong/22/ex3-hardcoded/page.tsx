import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { MenuPage } from './MenuPage.tsx'

export function renderPage(products: readonly Product[]): string {
  const html = renderToString(<MenuPage products={products} />)
  const json = JSON.stringify(products).replace(/</g, '\\u003c')
  return `<div id="root">${html}</div><script type="application/json" id="menu-data">${json}</script>`
}

export function hydratePage(container: HTMLElement, options?: HydrationOptions): Root {
  // 錯：瀏覽器用自己 import 的那份菜單，跟伺服器這次 render 的資料不一定一樣
  return hydrateRoot(container, <MenuPage products={PRODUCTS} />, options)
}
