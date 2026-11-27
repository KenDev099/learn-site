// 第 5 課四題共用：等 Gateway 與 HTTPRoute 的 status、從 Mac 經 kindccm 容器發請求
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { PRACTICE, kubeJson, run, waitFor } from '../../helpers/k8s.ts'

export type Reply = { status: number, headers: Record<string, any>, body: string, error: string }

const cond = (list: any[] | undefined, type: string) => (list ?? []).find((c: any) => c.type === type)

// 等 Gateway 的 Programmed=True，回傳 Gateway 物件（status.addresses 裡有叢集內可連的 IP）
export function waitGateway(ns: string, name: string, ms = 180_000): Promise<any> {
  return waitFor(() => {
    const gw = kubeJson('get', 'gateway', name, '-n', ns)
    const p = cond(gw.status?.conditions, 'Programmed')
    if (p?.status === 'True' && p.observedGeneration === gw.metadata.generation) return gw
    throw new Error(`Programmed=${p?.status ?? '（還沒有）'} ${p?.reason ?? ''} ${p?.message ?? ''}`)
  }, ms, `Gateway ${name} 沒有變成 Programmed=True，用 kubectl describe gateway ${name} -n ${ns} 看 status`, 2000)
}

// 等每個 HTTPRoute 都被控制器處理過（status 的 observedGeneration 跟上 generation），回傳 [{ name, conditions }]
export function waitRoutes(ns: string, ms = 120_000): Promise<{ name: string, conditions: Record<string, any> }[]> {
  return waitFor(() => {
    const routes = kubeJson('get', 'httproute', '-n', ns).items
    if (!routes.length) throw new Error('namespace 裡沒有任何 HTTPRoute')
    const out = routes.map((r: any) => {
      const conds = (r.status?.parents ?? []).flatMap((p: any) => p.conditions ?? [])
      const fresh = conds.length && conds.every((c: any) => c.observedGeneration === r.metadata.generation)
      return fresh ? { name: r.metadata.name, conditions: Object.fromEntries(conds.map((c: any) => [c.type, c])) } : null
    })
    return out.every(Boolean) ? out : null
  }, ms, `HTTPRoute 的 status 一直沒有更新：確認 parentRefs 指到的 Gateway 名稱對不對（kubectl get httproute -n ${ns} -o yaml）`, 2000)
}

// 把 route 的條件寫成一行，給錯誤訊息用
export const describeConds = (c: Record<string, any>) => Object.values(c).map((x: any) => `${x.type}=${x.status}（${x.reason}：${x.message}）`).join('；')

// Gateway 在 Mac 上的網址：http://localhost:<port>（bin/url.mjs 查 kindccm 容器的 port 對應）
export function gatewayUrl(ns: string, name: string, port = 80): string {
  const r = run(process.execPath, [join(PRACTICE, 'bin', 'url.mjs'), ns, `gateway/${name}`, String(port)], { timeout: 90_000 })
  if (r.code !== 0) throw new Error(`找不到 Gateway ${name} 的 ${port} port 對應：${r.stderr}`)
  return r.stdout.trim()
}

// 從 Mac 發一個 HTTP 請求，自己指定 Host 標頭（等於 curl -H 'Host: …'）
export function get(base: string, host: string, path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return send(http, base + path, { headers: { host, ...headers } })
}

// HTTPS：連 localhost 的對應 port，但 SNI 與憑證檢查用 servername（等於 curl --resolve cafe.test:<port>:127.0.0.1）
export function getTls(base: string, servername: string, path: string, ca: string): Promise<Reply> {
  return send(https, base.replace(/^http:/, 'https:') + path, { headers: { host: servername }, servername, ca })
}

function send(mod: typeof http | typeof https, url: string, opts: any): Promise<Reply> {
  return new Promise(resolve => {
    const req = mod.request(url, { agent: false, timeout: 20_000, ...opts }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, error: '' }))
    })
    req.on('timeout', () => req.destroy(new Error('20 秒沒有回應')))
    req.on('error', e => resolve({ status: 0, headers: {}, body: '', error: e.message }))
    req.end()
  })
}

// 回應來自哪個 Pod：cafe-api 每個回應都有 x-instance（Pod 名稱）
export const instance = (r: Reply) => String(r.headers['x-instance'] ?? '')
export const show = (r: Reply) => r.status ? `${r.status}，x-instance=${instance(r) || '（沒有，Gateway 自己回的）'}，內容 ${r.body.slice(0, 120)}` : `連線失敗：${r.error}`
