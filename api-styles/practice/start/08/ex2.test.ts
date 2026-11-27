import test from 'node:test'
import assert from 'node:assert/strict'
import { create, fromBinary, toBinary, type DescMessage } from '@bufbuild/protobuf'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'
import { decodeStock, encodeStock, toWireHex, type Stock } from './codec.ts'

const opts = { timeout: 10_000 }

async function schemas() {
  let mod: Record<string, unknown>
  try {
    mod = await import('./gen/coffee/inventory/v1/inventory_pb.js')
  } catch (e) {
    assert.fail(`讀不到 gen/coffee/inventory/v1/inventory_pb.js（練習 2 用練習 1 的 .proto 產生的程式碼，先完成練習 1）：${(e as Error).message}`)
  }
  const { StockLevelSchema, GetStockResponseSchema } = mod as Record<string, DescMessage | undefined>
  assert.ok(StockLevelSchema && GetStockResponseSchema, 'gen 裡沒有 StockLevelSchema 或 GetStockResponseSchema：練習 2 用的是練習 1 的 inventory.proto，先完成練習 1')
  return { StockLevelSchema, GetStockResponseSchema }
}

// 每次執行都換資料：一定有 available = 0、reorderPoint = 0、沒有 reorderPoint、超過 127 的數字（varint 要兩個位元組以上）
function sample(): Stock[] {
  const random = mulberry32(Date.now())
  const ids = shuffle(PRODUCTS, random).map(p => p.id).slice(0, 4 + Math.floor(random() * 3))
  return ids.map((productId, i) => {
    const available = i === 0 ? 0 : i === 1 ? 128 + Math.floor(random() * 20000) : Math.floor(random() * 120)
    const reorderPoint = i === 1 ? undefined : i === 2 ? 0 : i === 0 ? 5 + Math.floor(random() * 300) : random() < 0.5 ? undefined : Math.floor(random() * 50)
    return reorderPoint === undefined ? { productId, available } : { productId, available, reorderPoint }
  })
}

const byId = (list: Stock[]) => [...list].sort((a, b) => a.productId.localeCompare(b.productId))
// 只比對有值的屬性：{ reorderPoint: undefined } 和沒有 reorderPoint 視為相同
const plain = (list: Stock[]) => byId(list).map(s => JSON.parse(JSON.stringify(s)))

test('encodeStock 產生 GetStockResponse 的 protobuf 位元組', opts, async () => {
  const { GetStockResponseSchema } = await schemas()
  const levels = sample()
  const bytes = encodeStock(levels)
  assert.ok(bytes instanceof Uint8Array, 'encodeStock 要回傳 Uint8Array（toBinary 的結果）')
  let decoded
  try {
    decoded = fromBinary(GetStockResponseSchema, bytes)
  } catch (e) {
    assert.fail(`測試用 fromBinary(GetStockResponseSchema, …) 解不開你的位元組，它不是 protobuf（是不是用了 JSON？）：${(e as Error).message}`)
  }
  const map = (decoded as unknown as { levels: Record<string, { productId: string; available: number; reorderPoint?: number }> }).levels
  assert.deepEqual(Object.keys(map).sort(), levels.map(l => l.productId).sort(), 'levels 的 key 要是每筆的 productId')
  for (const l of levels) {
    const got = map[l.productId]
    assert.equal(got.productId, l.productId, `levels['${l.productId}'].productId 要是 ${l.productId}`)
    assert.equal(got.available, l.available, `商品 ${l.productId} 的 available 要是 ${l.available}`)
    assert.equal(got.reorderPoint, l.reorderPoint, l.reorderPoint === undefined
      ? `商品 ${l.productId} 沒有設定 reorderPoint，編碼時不要填 0`
      : `商品 ${l.productId} 的 reorderPoint 要是 ${l.reorderPoint}（0 也要送出）`)
  }
})

test('decodeStock 解回陣列，分得出 reorderPoint 是 0 還是沒設定', opts, async () => {
  const { GetStockResponseSchema, StockLevelSchema } = await schemas()
  const levels = sample()
  const init = Object.fromEntries(levels.map(l => [l.productId, create(StockLevelSchema, l)]))
  const bytes = toBinary(GetStockResponseSchema, create(GetStockResponseSchema, { levels: init } as never))
  const got = decodeStock(bytes)
  assert.ok(Array.isArray(got), 'decodeStock 要回傳陣列')
  for (const s of got) {
    assert.equal(typeof s.available, 'number', `商品 ${s.productId} 的 available 要是數字；0 在線上格式不會被送出，解碼後仍要是 0（不要用 toJson，它會省略預設值）`)
    const want = levels.find(l => l.productId === s.productId)
    if (want && want.reorderPoint === undefined) assert.equal(s.reorderPoint, undefined, `商品 ${s.productId} 沒有設定 reorderPoint，解碼後不能變成 ${s.reorderPoint}：用 optional 欄位本來的 undefined`)
  }
  assert.deepEqual(plain(got), plain(levels), '解碼的結果要跟原本的資料一樣（順序不重要）')
  assert.deepEqual(plain(decodeStock(encodeStock(levels))), plain(levels), 'decodeStock(encodeStock(x)) 要等於 x')
})

// 手算線上格式：tag = 欄位編號 << 3 | wire type；數字用 varint（每個位元組 7 位元，最高位元 1 代表後面還有）
function varint(n: number) {
  const out: number[] = []
  while (n > 127) { out.push((n & 0x7f) | 0x80); n >>>= 7 }
  out.push(n)
  return out
}
function handHex(s: Stock) {
  const id = [...new TextEncoder().encode(s.productId)]
  const bytes = [(1 << 3) | 2, ...varint(id.length), ...id]
  if (s.available !== 0) bytes.push((2 << 3) | 0, ...varint(s.available))
  if (s.reorderPoint !== undefined) bytes.push((3 << 3) | 0, ...varint(s.reorderPoint))
  return Buffer.from(bytes).toString('hex')
}

test('toWireHex 的每個位元組都跟手算的一樣', opts, () => {
  for (const s of sample()) {
    assert.equal(toWireHex(s), handHex(s), `${JSON.stringify(s)} 的線上格式應該是 ${handHex(s)}：用 toBinary(StockLevelSchema, create(StockLevelSchema, …)) 再轉成十六進位`)
  }
})

test('壞掉的位元組要丟錯，不能當成空資料', opts, () => {
  // 0a 05 31：欄位 1、長度 5，卻只有 1 個位元組
  assert.throws(() => decodeStock(new Uint8Array([0x0a, 0x05, 0x31])), '位元組不完整時 fromBinary 會丟錯，decodeStock 不要把錯誤吃掉')
})
