import { createServer } from 'node:http'
import type { MenuItem } from './menu.ts'
import { sendJson, sendProblem } from './http-utils.ts'
import { etagOf, noneMatch } from './etag.ts'

type Lang = 'zh-TW' | 'en'

// Accept-Language: "fr, en-US;q=0.8, zh;q=0.5" → 依 q 由高到低，找第一個我們有的語言
export function pickLanguage(header: string | undefined): Lang {
  const prefs = (header ?? '').split(',').map(part => {
    const [tag, ...params] = part.split(';').map(s => s.trim())
    const q = params.find(p => p.startsWith('q='))
    return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 }
  }).filter(p => p.tag && p.q > 0)
  prefs.sort((a, b) => b.q - a.q)   // sort 是穩定的：q 一樣時保留原本的順序
  for (const { tag } of prefs) {
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-TW'
  }
  return 'zh-TW'
}

// 練習 2：GET /menu 依 Accept-Language 回中文（zh-TW，預設）或英文（en）品名
export function createApp(menu: MenuItem[]) {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/menu') return sendProblem(res, 404, 'Not Found', '找不到這個路徑')
    if (req.method !== 'GET') return sendProblem(res, 405, 'Method Not Allowed', '只支援 GET', { allow: 'GET' })

    const lang = pickLanguage(req.headers['accept-language'])
    const items = menu.map(({ id, name, nameEn, price }) => ({ id, name: lang === 'en' ? nameEn : name, price }))
    // ETag 用「這個語言版本」的內容算，兩種語言自然不同
    const headers = {
      etag: etagOf(JSON.stringify(menu.map(i => i.price))),
      'content-language': lang,
      vary: 'Accept-Language',
      'cache-control': 'public, max-age=60',
    }
    if (noneMatch(req.headers['if-none-match'], headers.etag)) {
      res.writeHead(304, headers)
      return res.end()
    }
    sendJson(res, 200, items, headers)
  })
}
