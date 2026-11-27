import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'

const opts = { timeout: 15_000 }
type Reading = { machineId: number, size: string, hot: boolean, extraShot: boolean, timestamp: number, totalCups: number }

async function load() {
  const mod: { parseReadings?: unknown } = await import('./parse-reading.ts')
  assert.equal(typeof mod.parseReadings, 'function', 'parse-reading.ts 要 export parseReadings')
  return mod.parseReadings as (buf: Buffer) => Reading[]
}

const rand = (max: number) => Math.floor(Math.random() * max)
type Raw = { machineId: number, sizeCode: number, flags: number, timestamp: number, totalCups: number }
function encode(records: Raw[]) {
  const buf = Buffer.alloc(records.length * 12)
  records.forEach((r, i) => {
    const o = i * 12
    buf.writeUInt16BE(r.machineId, o)
    buf.writeUInt8(r.sizeCode, o + 2)
    buf.writeUInt8(r.flags, o + 3)
    buf.writeUInt32BE(r.timestamp, o + 4)
    buf.writeUInt32BE(r.totalCups, o + 8)
  })
  return buf
}
const expected = (r: Raw): Reading => ({
  machineId: r.machineId,
  size: ['S', 'M', 'L'][r.sizeCode - 1],
  hot: (r.flags & 1) !== 0,
  extraShot: (r.flags & 2) !== 0,
  timestamp: r.timestamp,
  totalCups: r.totalCups,
})

test('解析多筆紀錄：big-endian、uint32 大於 2^31 不能變負數、旗標逐位元判斷', opts, async () => {
  const parseReadings = await load()
  const records: Raw[] = Array.from({ length: 24 }, (_, i) => ({
    machineId: 256 + rand(65_000),
    sizeCode: 1 + (i % 3),
    flags: i % 8,                                   // 0–7：含 bit2 這種不用管的位元
    timestamp: 1_700_000_000 + rand(100_000_000),
    totalCups: i % 2 ? 2 ** 31 + rand(2 ** 31 - 1) : rand(100_000),
  }))
  const got = parseReadings(encode(records))
  assert.ok(Array.isArray(got), 'parseReadings 要回傳陣列')
  assert.equal(got.length, records.length, `${records.length * 12} 個位元組應該是 ${records.length} 筆`)
  records.forEach((r, i) => {
    const g = got[i]
    assert.equal(g.machineId, r.machineId, `第 ${i + 1} 筆的機台編號不對：uint16、big-endian，用 readUInt16BE`)
    assert.equal(g.timestamp, r.timestamp, `第 ${i + 1} 筆的時間戳記不對：uint32、big-endian，用 readUInt32BE`)
    assert.equal(g.totalCups, r.totalCups, `第 ${i + 1} 筆的累計杯數不對：它是「無號」32 位元整數，大於 2^31 時用 readInt32BE 會變成負數`)
    assert.equal(g.size, expected(r).size, `第 ${i + 1} 筆的杯型不對：1 = S、2 = M、3 = L`)
    assert.equal(g.hot, expected(r).hot, `第 ${i + 1} 筆旗標是 0b${r.flags.toString(2)}，熱飲看 bit0：用 (flags & 1) 判斷，不是看 flags 等於多少`)
    assert.equal(g.extraShot, expected(r).extraShot, `第 ${i + 1} 筆旗標是 0b${r.flags.toString(2)}，加濃縮看 bit1：用 (flags & 2) 判斷`)
    assert.deepEqual(g, expected(r), `第 ${i + 1} 筆的物件只要這六個欄位`)
  })
  assert.deepEqual(parseReadings(Buffer.alloc(0)), [], '空的資料回傳 []')
})

test('長度不是 12 的倍數：丟 RangeError，不能默默丟掉最後一段', opts, async () => {
  const parseReadings = await load()
  const good = encode([{ machineId: 7, sizeCode: 2, flags: 1, timestamp: 1_760_000_000, totalCups: 42 }])
  for (const extra of [1, 5, 11]) {
    const buf = Buffer.concat([good, good, Buffer.alloc(extra, 1)])
    assert.throws(() => parseReadings(buf), (err: unknown) => {
      assert.ok(err instanceof RangeError, `長度 ${buf.length} 要丟 RangeError`)
      assert.match(err.message, /12/, '錯誤訊息要說明長度不是 12 的倍數，查問題的人才看得懂')
      return true
    }, `長度 ${buf.length} 不是 12 的倍數，最後一筆不完整：先檢查長度再讀，不要只讀完整的部分`)
  }
})

test('杯型不是 1–3：丟 RangeError', opts, async () => {
  const parseReadings = await load()
  for (const sizeCode of [0, 4, 255]) {
    const buf = encode([
      { machineId: 1, sizeCode: 1, flags: 0, timestamp: 1, totalCups: 1 },
      { machineId: 2, sizeCode, flags: 0, timestamp: 2, totalCups: 2 },
    ])
    assert.throws(() => parseReadings(buf), RangeError, `杯型 ${sizeCode} 不合法，要丟 RangeError`)
  }
})

test('buf 是大 Buffer 中間的一段（byteOffset 不是 0）也要從 buf 自己的開頭讀，而且不能改到 buf', opts, async () => {
  const parseReadings = await load()
  const records: Raw[] = Array.from({ length: 3 }, (_, i) => ({ machineId: 1 + rand(65_000), sizeCode: 1 + i, flags: rand(4), timestamp: rand(2 ** 32), totalCups: rand(2 ** 32) }))
  const body = encode(records)
  const big = Buffer.concat([Buffer.alloc(5, 0xff), body, Buffer.alloc(7, 0xee)])
  const part = big.subarray(5, 5 + body.length)
  const before = Buffer.from(big)
  assert.deepEqual(parseReadings(part), records.map(expected), 'buf 可能是 subarray 或來自 Buffer 共用的記憶體池，buf.buffer 的開頭不是 buf 的開頭：用 buf.readUInt16BE(offset) 這類方法，或 new DataView(buf.buffer, buf.byteOffset, buf.length)')
  assert.deepEqual(big, before, 'parseReadings 只能讀，不能修改傳進來的資料')
})
