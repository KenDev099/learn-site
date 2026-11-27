// 建置：把 site/ 複製到 dist/，用 data/store.json 填入營業時間與 JSON-LD，再產生 sitemap.xml
// 自己預覽：node build.ts && node serve.ts dist
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ORIGIN = 'https://brew.example.tw'
export type Hours = { days: number[], opens: string, closes: string }   // days：0 是週一，6 是週日
export type Store = {
  name: string, url: string, telephone: string, priceRange: string,
  address: { streetAddress: string, addressLocality: string, addressRegion: string, postalCode: string, addressCountry: string },
  geo: { latitude: number, longitude: number },
  hours: Hours[],
}
export type Route = { path: string, file: string, noindex?: boolean }

// 路由表：網站有哪些頁面
export const routes: Route[] = [
  { path: '/', file: 'index.html' },
  { path: '/menu/', file: 'menu/index.html' },
  { path: '/store/', file: 'store/index.html' },
  { path: '/404.html', file: '404.html', noindex: true },
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ZH = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

// sitemap.xml 的內容：只列出要被搜尋引擎收錄的頁面（第 23 課練習 2 的規則）
export function sitemapXml(routes: Route[], origin: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
  const urls = routes
    .filter(r => !r.noindex)
    .map(r => `  <url><loc>${esc(new URL(r.path, origin).href)}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`
}

// 頁面上的營業時間：每天一列，沒有營業的那天寫「公休」
export function hoursHtml(hours: Hours[]): string {
  return `<dl class="hours">
  <div><dt>週一</dt><dd>07:30–18:00</dd></div>
  <div><dt>週二</dt><dd>07:30–18:00</dd></div>
  <div><dt>週三</dt><dd>07:30–18:00</dd></div>
  <div><dt>週四</dt><dd>07:30–18:00</dd></div>
  <div><dt>週五</dt><dd>07:30–18:00</dd></div>
  <div><dt>週六</dt><dd>09:00–17:00</dd></div>
  <div><dt>週日</dt><dd>09:00–17:00</dd></div>
</dl>`
}

// 門市的 JSON-LD（第 24 課）：跟 hoursHtml 用同一份資料
export function storeJsonLd(store: Store): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    '@id': `${ORIGIN}/store/#store`,
    name: store.name,
    url: store.url,
    telephone: store.telephone,
    address: { '@type': 'PostalAddress', ...store.address },
    geo: { '@type': 'GeoCoordinates', ...store.geo },
    menu: `${ORIGIN}/menu/`,
    servesCuisine: '咖啡',
    priceRange: store.priceRange,
    openingHoursSpecification: [{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"07:30","closes":"18:00"},{"@type":"OpeningHoursSpecification","dayOfWeek":["Saturday","Sunday"],"opens":"09:00","closes":"17:00"}],
  }
}

// 已經寫好：頁面裡的 <!-- build:hours --> 換成 hoursHtml()，<!-- build:store-jsonld --> 換成 JSON-LD
export function build(src: string, out: string): void {
  const store: Store = JSON.parse(readFileSync(join(src, 'data', 'store.json'), 'utf8'))
  rmSync(out, { recursive: true, force: true })
  cpSync(src, out, { recursive: true })
  const ld = `<script type="application/ld+json">\n${JSON.stringify(storeJsonLd(store), null, 2).replaceAll('<', '\\u003c')}\n</script>`
  for (const r of routes) {
    const file = join(out, r.file)
    const html = readFileSync(file, 'utf8')
      .replaceAll('<!-- build:hours -->', hoursHtml(store.hours))
      .replaceAll('<!-- build:store-jsonld -->', ld)
    writeFileSync(file, html)
  }
  writeFileSync(join(out, 'sitemap.xml'), sitemapXml(routes, ORIGIN))
}

if (import.meta.main) {
  build('site', 'dist')
  console.log('已建置到 dist/')
}
