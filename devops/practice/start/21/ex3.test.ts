// 練習 3：錯誤 log 裡的 token、密碼、卡號、email 在寫出之前就被遮蔽，其他除錯資訊照常留著
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { join } from 'node:path'

const dir = join(import.meta.dirname, 'shop')
const hex = (n: number) => randomBytes(n).toString('hex')
const letters = (n: number) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[randomInt(26)]).join('')

// 啟動 shop/server.ts、送一個會失敗的結帳請求、送 SIGTERM，回傳 stdout + stderr 的全部內容
async function checkout(headers: Record<string, string>, body: unknown) {
  const p = spawn(process.execPath, ['server.ts'], { cwd: dir, env: { ...process.env, PORT: '0' } })
  let out = ''
  p.stdout.on('data', d => out += d)
  p.stderr.on('data', d => out += d)
  const closed = new Promise(r => p.on('close', r))
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server.ts 5 秒內沒有印出 listening：\n${out.slice(-1500)}`)), 5_000)
      p.stdout.on('data', () => {
        const m = out.match(/"port":(\d+)/)
        if (m) { clearTimeout(timer); resolve(Number(m[1])) }
      })
      p.on('close', () => reject(new Error(`server.ts 啟動就結束了，logger.ts 可能有錯：\n${out.slice(-1500)}`)))
    })
    const res = await fetch(`http://127.0.0.1:${port}/checkout`, { method: 'POST', headers, body: JSON.stringify(body) })
    await res.text()
    assert.equal(res.status, 500, `POST /checkout 應該回 500，實際是 ${res.status}`)
    await new Promise(r => setTimeout(r, 200))
  } finally {
    p.kill('SIGTERM')
    const timer = setTimeout(() => p.kill('SIGKILL'), 3_000)
    await closed
    clearTimeout(timer)
  }
  return out
}

function scenario() {
  const s = {
    token: `tok_${hex(16)}`, sid: `sid_${hex(12)}`, password: `pw-${hex(8)}`,
    card: String(4000_0000_0000_0000 + randomInt(1e9)), name: letters(8), domain: `${letters(6)}.test`,
    ua: `cafe-pos/${randomInt(1, 99)}.${randomInt(99)}`, rid: `req-${hex(6)}`,
  }
  const headers = { authorization: `Bearer ${s.token}`, cookie: `sid=${s.sid}; theme=dark`, 'user-agent': s.ua, 'x-request-id': s.rid, 'content-type': 'application/json' }
  const body = { email: `${s.name}@${s.domain}`, password: s.password, items: [{ productId: 2, quantity: 1 }], payment: { card: { number: s.card, exp: '12/29' } } }
  return { s, headers, body }
}

const errorLine = (out: string) => {
  const line = out.split('\n').flatMap(l => { try { return [JSON.parse(l)] } catch { return [] } }).find(l => l.msg === 'checkout failed')
  assert.ok(line, `找不到 msg 是 checkout failed 的 JSON log，輸出是：\n${out.slice(-1500)}`)
  return line
}

test('完整的輸出裡找不到 token、cookie、密碼、卡號、完整 email', async () => {
  const { s, headers, body } = scenario()
  const out = await checkout(headers, body)
  errorLine(out)
  for (const [what, value] of [['authorization 的 token', s.token], ['cookie 的 sid', s.sid], ['密碼', s.password], ['卡號', s.card], ['email 的帳號部分', s.name]])
    assert.ok(!out.includes(value), `${what}（${value}）出現在 log 裡：redact 的路徑要寫到那個欄位真正的位置，例如 req.headers.authorization、body.payment.card.number；只寫 password 這種第一層的鍵，抓不到巢狀的欄位`)
})

test('被遮蔽的欄位還在，值是 [REDACTED]；email 只留第一個字和網域', async () => {
  const { s, headers, body } = scenario()
  const line = errorLine(await checkout(headers, body))
  const h = line.req?.headers ?? {}
  assert.equal(h.authorization, '[REDACTED]', 'req.headers.authorization 要是 [REDACTED]（censor 的字串要完全一樣，pino 預設的是 [Redacted]）')
  assert.equal(h.cookie, '[REDACTED]', 'req.headers.cookie 要是 [REDACTED]')
  assert.equal(line.body?.password, '[REDACTED]', 'body.password 要是 [REDACTED]')
  assert.equal(line.body?.payment?.card?.number, '[REDACTED]', 'body.payment.card.number 要是 [REDACTED]')
  assert.equal(line.body?.email, `${s.name[0]}***@${s.domain}`, `body.email 應該是 ${s.name[0]}***@${s.domain}：留第一個字、三個星號、@ 和網域。censor 可以是函式 (value, path) => …`)
})

test('除錯需要的資訊還在：request_id、route、user-agent、商品、卡片到期日', async () => {
  const { s, headers, body } = scenario()
  const line = errorLine(await checkout(headers, body))
  assert.equal(line.request_id, s.rid, 'request_id 不見了')
  assert.equal(line.route, 'POST /checkout', 'route 不見了')
  assert.equal(line.req?.headers?.['user-agent'], s.ua, 'user-agent 標頭不見了：只遮蔽敏感的標頭，不要把整個 req.headers 拿掉')
  assert.deepEqual(line.body?.items, body.items, 'body.items 不見了：只遮蔽敏感欄位，不要把整個 body 拿掉')
  assert.equal(line.body?.payment?.card?.exp, '12/29', 'body.payment.card.exp 不見了：只遮 number，不要把整張卡拿掉')
  assert.match(line.err?.stack ?? '', /payment gateway timeout/, 'err 的 stack 不見了')
})
