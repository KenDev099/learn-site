import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

const opts = { timeout: 15_000 }
type Result = { revenue: Map<string, number>, badLines: number }
type Import = (input: Readable, onProgress: (lines: number) => void) => Promise<Result>

async function load() {
  const mod: { importOrders?: unknown } = await import('./import-orders.ts')
  assert.equal(typeof mod.importOrders, 'function', 'import-orders.ts 要 export async function importOrders(input, onProgress)')
  return mod.importOrders as Import
}

const MENU: [string, number][] = [['美式咖啡', 80], ['拿鐵', 110], ['卡布奇諾', 110], ['伯爵紅茶', 90], ['可頌', 70], ['起司蛋糕', 120], ['☕特調', 150]]
const BAD = ['拿鐵,abc,110', '拿鐵,2', ',1,80', '可頌,0,70', '可頌,1.5,70', '拿鐵,2,110,多一欄', '美式咖啡,-1,80']
const rand = (n: number) => Math.floor(Math.random() * n)

// 產生 total 行（含中文、隨機的 \r\n、格式錯誤的行、零星的空行，最後一行沒有換行），同時算出正確答案
function makeData(total: number) {
  const lines: string[] = []
  const revenue = new Map<string, number>()
  let badLines = 0
  for (let i = 0; i < total; i++) {
    if (i > 0 && rand(100) === 0) lines.push('')   // 空行：略過，不算已處理
    if (rand(50) === 0) { lines.push(BAD[rand(BAD.length)]); badLines++; continue }
    const [item, price] = MENU[rand(MENU.length)]
    const qty = 1 + rand(5)
    lines.push(`${item},${qty},${price}`)
    revenue.set(item, (revenue.get(item) ?? 0) + qty * price)
  }
  const text = lines.map((l, i) => i === lines.length - 1 ? l : l + (rand(3) ? '\n' : '\r\n')).join('')
  return { text, revenue, badLines }
}

// 把資料切成不規則的 Buffer，切點常常落在中文字中間；每送出一段就記錄「已經送出幾行有內容的完整行」（state.sent）
// 握手：送出的行數比最後回報的進度多 20,000 行以上就暫停，等 importOrders 回報進度；2 秒等不到就判定它沒有邊讀邊處理
type Shake = { reported: number, sent: number, failed: boolean, wake?: () => void }
function handshakeStream(text: string, state: Shake) {
  const bytes = Buffer.from(text)
  async function* gen() {
    let pos = 0, lineLen = 0
    while (pos < bytes.length) {
      const end = Math.min(bytes.length, pos + 1000 + rand(8000))
      const piece = bytes.subarray(pos, end)
      for (const b of piece) {
        if (b === 0x0a) { if (lineLen > 0) state.sent++; lineLen = 0 }
        else if (b !== 0x0d) lineLen++
      }
      pos = end
      if (pos === bytes.length && lineLen > 0) state.sent++   // 最後一行沒有換行
      yield piece
      while (state.sent - state.reported > 20_000) {
        const woke = await new Promise<boolean>(resolve => {
          state.wake = () => resolve(true)
          setTimeout(() => resolve(false), 2000).unref()
        })
        if (!woke) {
          state.failed = true
          throw new Error('握手逾時：importOrders 讀了 2 萬行以上還沒回報進度')
        }
      }
    }
  }
  return Readable.from(gen())
}

test('逐行處理 30 萬行：邊讀邊回報進度，結果正確', opts, async () => {
  const importOrders = await load()
  const data = makeData(300_000)
  const state: Shake = { reported: 0, sent: 0, failed: false }
  const progress: number[] = []
  let ahead = ''
  let result: Result | undefined, error: unknown
  try {
    result = await importOrders(handshakeStream(data.text, state), n => {
      if (n > state.sent && !ahead) ahead = `onProgress(${n}) 被呼叫時，資料源只送出了 ${state.sent} 行有內容的資料`
      progress.push(n)
      state.reported = n
      state.wake?.()
    })
  } catch (e) { error = e }
  assert.equal(state.failed, false, '資料讀了 2 萬行以上，importOrders 還沒回報進度：它是不是先把整個檔案收進記憶體才處理？用 readline 的 createInterface 逐行讀')
  assert.equal(ahead, '', `${ahead}：進度要算「真的處理完的行」，空行不算，不能用數換行字元的方式估`)
  assert.equal(error, undefined, `importOrders 丟出錯誤：${(error as Error)?.message}`)
  assert.ok(result, 'importOrders 要回傳 { revenue, badLines }')
  assert.deepEqual(progress, Array.from({ length: 30 }, (_, i) => (i + 1) * 10_000), 'onProgress 要在第 10000、20000…300000 行各呼叫一次（格式錯誤的行也算已處理，空行不算）。進度要在真的處理完那一行之後才回報')
  assert.equal(result.badLines, data.badLines, '格式錯誤的行數不對')
  assert.ok(result.revenue instanceof Map, 'revenue 要是 Map')
  for (const [item, sum] of data.revenue) {
    assert.equal(result.revenue.get(item), sum, `「${item}」的營收不對。如果出現 � 或品項名稱怪怪的，是每個 chunk 各自解碼，中文被切壞了；如果差一點點，檢查最後一行（沒有換行）有沒有算進去`)
  }
  assert.equal(result.revenue.size, data.revenue.size, `revenue 多了不存在的品項：${[...result.revenue.keys()].filter(k => !data.revenue.has(k)).slice(0, 3).join('、')}（中文被切壞了？）`)
})

test('小檔案：空行略過，最後一行沒有換行也要算，中文被切在兩段之間也不能壞', opts, async () => {
  const importOrders = await load()
  const qty = 1 + rand(9)
  const text = `拿鐵,1,110\r\n\r\n可頌,2,70\n壞掉的一行\n\n起司蛋糕,${qty},120`
  const bytes = Buffer.from(text)
  for (let at = 1; at < bytes.length; at++) {
    const r = await importOrders(Readable.from([bytes.subarray(0, at), bytes.subarray(at)]), () => {})
    assert.deepEqual([...r.revenue].sort(), [['可頌', 140], ['拿鐵', 110], ['起司蛋糕', qty * 120]].sort(), `在第 ${at} 個位元組切成兩段時，revenue 不對`)
    assert.equal(r.badLines, 1, `在第 ${at} 個位元組切成兩段時，badLines 不對（空行要略過，不算格式錯誤）`)
  }
})
