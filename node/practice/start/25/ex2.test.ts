import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { connect } from 'node:net'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type ReqLike = { socket: { remoteAddress?: string }, headers: IncomingHttpHeaders }
type ClientIp = (req: ReqLike, o: { trustedProxies: string[] }) => string | null

async function load() {
  const mod: { clientIp?: unknown } = await import('./client-ip.ts')
  assert.equal(typeof mod.clientIp, 'function', 'client-ip.ts 要 export function clientIp(req, { trustedProxies })')
  return mod.clientIp as ClientIp
}
const n = () => 1 + Math.floor(Math.random() * 250)
const pub = () => `${[203, 198, 45, 61][Math.floor(Math.random() * 4)]}.${n()}.${n()}.${n()}`   // 外面的客戶端
const lan = () => `10.${n()}.${n()}.${n()}`                                                        // 自己的代理
const req = (remoteAddress: string, xff?: string): ReqLike => ({ socket: { remoteAddress }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } })

test('直連的不是信任的代理：直接回傳直連位址，不看 X-Forwarded-For', opts, async () => {
  const clientIp = await load()
  const client = pub(), proxy = lan(), fake = pub()
  assert.equal(clientIp(req(client), { trustedProxies: [proxy] }), client, '沒有 X-Forwarded-For 時回傳 socket 的位址')
  assert.equal(clientIp(req(client, fake), { trustedProxies: [proxy] }), client,
    `客戶端直接連進來、自己帶了 X-Forwarded-For: ${fake}：直連的不是信任的代理，這個標頭是客戶端寫的，不能採用`)
  assert.equal(clientIp(req(`::ffff:${client}`), { trustedProxies: [proxy] }), client, '直連位址 ::ffff:1.2.3.4 要去掉 ::ffff: 前綴')
})

test('經過信任的代理：X-Forwarded-For 從右往左，跳過信任的代理', opts, async () => {
  const clientIp = await load()
  const client = pub(), proxy = lan(), proxy2 = lan(), fake = pub()
  assert.equal(clientIp(req(proxy, client), { trustedProxies: [proxy] }), client, '一層代理：回傳 X-Forwarded-For 最右邊的位址')
  assert.equal(clientIp(req(proxy, `${fake}, ${client}`), { trustedProxies: [proxy] }), client,
    `X-Forwarded-For: ${fake}, ${client}：${fake} 是客戶端自己偽造的，最右邊的 ${client} 才是代理親眼看到的。不要取最左邊`)
  assert.equal(clientIp(req(proxy, ` ${fake} ,${client} , ${proxy2}`), { trustedProxies: [proxy, proxy2] }), client,
    '兩層代理：最右邊的是第二層代理，也要跳過；逗號前後可能有空白')
  assert.equal(clientIp(req(`::ffff:${proxy}`, client), { trustedProxies: [proxy] }), client,
    `代理的直連位址是 ::ffff:${proxy}：去掉 ::ffff: 之後才是信任清單裡的 ${proxy}`)
  assert.equal(clientIp(req(proxy, `${client}, ::ffff:${proxy2}`), { trustedProxies: [proxy, proxy2] }), client, 'X-Forwarded-For 裡的位址也要去掉 ::ffff:')
  assert.equal(clientIp(req(proxy, `${proxy2}`), { trustedProxies: [proxy, proxy2] }), proxy2, '全部都是信任的代理：回傳最左邊那個')
  assert.equal(clientIp(req(proxy), { trustedProxies: [proxy] }), proxy, '直連的是代理、但沒有 X-Forwarded-For：回傳直連位址')
})

test('要回傳的值不是合法 IP 時回傳 null', opts, async () => {
  const clientIp = await load()
  const proxy = lan(), client = pub()
  assert.equal(clientIp(req(proxy, `${client}, unknown`), { trustedProxies: [proxy] }), null, '最右邊不信任的值是 unknown：不是 IP，回傳 null（用 net.isIP 檢查）')
  assert.equal(clientIp(req(proxy, `<script>, ${client}`), { trustedProxies: [proxy] }), client, '左邊的垃圾不影響：要回傳的是最右邊不信任的那個')
  assert.equal(clientIp(req(proxy, `${client}<x>`), { trustedProxies: [proxy] }), null, `${client}<x> 不是合法 IP，回傳 null`)
})

test('真的 node:http：兩個 X-Forwarded-For 標頭會被合併成「a, b」', opts, async () => {
  const clientIp = await load()
  const fake = pub(), client = pub()
  let got: string | null | undefined
  const server = createServer((r, res) => { got = clientIp(r, { trustedProxies: ['127.0.0.1'] }); res.end() })
  const { port } = await listen(server)
  await new Promise<void>((resolve, reject) => {
    const s = connect(port, '127.0.0.1', () => s.write(`GET / HTTP/1.1\r\nHost: x\r\nX-Forwarded-For: ${fake}\r\nX-Forwarded-For: ${client}\r\nConnection: close\r\n\r\n`))
    s.on('data', () => {}).on('end', resolve).on('error', reject)
  })
  assert.equal(got, client, `兩個標頭合併成「${fake}, ${client}」，127.0.0.1 是信任的代理，客戶端是最右邊的 ${client}`)
})
