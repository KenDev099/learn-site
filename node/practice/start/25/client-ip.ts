// 練習 2：在反向代理後面找出真正的客戶端 IP
import { isIP } from 'node:net'
import type { IncomingHttpHeaders } from 'node:http'

// 只用到 req 的這兩個部分；測試會傳假的 req 進來
export type ReqLike = { socket: { remoteAddress?: string }, headers: IncomingHttpHeaders }

// trustedProxies：你自己的代理（Nginx、負載平衡器）的 IP，例如 ['10.0.0.5']
// 回傳客戶端 IP；要回傳的值不是合法 IP 時回傳 null
export function clientIp(req: ReqLike, { trustedProxies }: { trustedProxies: string[] }): string | null {
  // TODO：
  // 1. 直連位址 = req.socket.remoteAddress，去掉 ::ffff: 前綴
  // 2. 直連的不是信任的代理 → 回傳它，完全不看 X-Forwarded-For
  // 3. 直連的是信任的代理 → X-Forwarded-For 從右往左看，跳過信任的代理，第一個不信任的就是客戶端
  // 4. 全部都是信任的代理 → 回傳最左邊那個
  // 5. 要回傳的值 isIP() 是 0 → 回傳 null
  const xff = req.headers['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0].trim()
  const ip = first ?? req.socket.remoteAddress ?? ''
  return isIP(ip) ? ip : null
}
