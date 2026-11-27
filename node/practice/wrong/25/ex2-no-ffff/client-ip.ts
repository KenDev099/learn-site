// 練習 2：在反向代理後面找出真正的客戶端 IP
import { isIP } from 'node:net'
import type { IncomingHttpHeaders } from 'node:http'

// 只用到 req 的這兩個部分；測試會傳假的 req 進來
export type ReqLike = { socket: { remoteAddress?: string }, headers: IncomingHttpHeaders }

// IPv4 連到雙協定（::）的伺服器時，位址長得像 ::ffff:203.0.113.9
const plain = (ip: string) => ip

export function clientIp(req: ReqLike, { trustedProxies }: { trustedProxies: string[] }): string | null {
  const trusted = new Set(trustedProxies.map(plain))
  const direct = plain(req.socket.remoteAddress ?? '')
  // 直連的不是自己的代理：X-Forwarded-For 是客戶端自己寫的，一個字都不能信
  if (!trusted.has(direct)) return isIP(direct) ? direct : null

  const xff = req.headers['x-forwarded-for']
  const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '')
    .split(',').map(s => plain(s.trim())).filter(s => s !== '')
  // 最右邊是最靠近我們的那一層加的；往左走，跳過自己的代理
  let ip = direct
  for (let i = hops.length - 1; i >= 0; i--) {
    ip = hops[i]
    if (!trusted.has(ip)) break
  }
  return isIP(ip) ? ip : null
}
