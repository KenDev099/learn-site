import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, createFileRegistry, fromBinary, toBinary, ScalarType, type DescMessage } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import { mulberry32 } from '../../helpers/coffee.ts'

const opts = { timeout: 30_000 }
const dir = import.meta.dirname
const buf = join(dir, '../../node_modules/.bin/buf')
const run = (args: string[], cwd = dir) => spawnSync(buf, args, { cwd, encoding: 'utf8' })

// 用 buf build 把 .proto 編成描述檔，不用另外產生程式碼也能編碼、解碼
function load(version: 'old' | 'new') {
  const r = spawnSync(buf, ['build', `evolve/${version}`, '-o', '-#format=binpb'], { cwd: dir })
  assert.equal(r.status, 0, `evolve/${version}/inventory.proto 編譯失敗：\n${String(r.stderr).trim()}`)
  const registry = createFileRegistry(fromBinary(FileDescriptorSetSchema, r.stdout))
  const get = (name: string): DescMessage => {
    const m = registry.getMessage(`coffee.inventory.v1.${name}`)
    assert.ok(m, `evolve/${version}/inventory.proto 要有 message ${name}（package 維持 coffee.inventory.v1）`)
    return m
  }
  return { Product: get('Product'), StockLevel: get('StockLevel') }
}

test('buf breaking（WIRE_JSON）通過', opts, () => {
  // 測試自己帶設定，改 evolve/new/buf.yaml 沒有用
  const r = run(['breaking', '--against', '../old', '--config', '{"version":"v2","breaking":{"use":["WIRE_JSON"]}}'], join(dir, 'evolve/new'))
  assert.equal(r.status, 0, `buf breaking 找到不相容的變更，照訊息修改：\n${(r.stdout + r.stderr).trim()}`)
})

test('下一版的結構：刪除要 reserved，改名要用新欄位', opts, () => {
  const { Product, StockLevel } = load('new')
  assert.ok(!Product.fields.some(f => f.name === 'price_twd'), '要刪除 Product.price_twd')
  const ranges = Product.proto.reservedRange
  assert.ok(ranges.some(r => r.start <= 3 && 3 < r.end), 'Product 要 reserved 3（price_twd 原本的編號），之後沒人能重用它')
  assert.ok(Product.proto.reservedName.includes('price_twd'), 'Product 也要 reserved "price_twd"（名稱），JSON 用名稱識別欄位')

  const available = StockLevel.fields.find(f => f.name === 'available')
  assert.ok(available, 'StockLevel.available 要留著：舊的 client 還在讀它，過渡期兩個欄位都要填')
  assert.equal(available.number, 2, 'available 的編號不能改，還是 2')
  assert.equal(available.deprecated, true, 'available 要加 [deprecated = true]，產生的程式碼會標成 @deprecated，提醒大家改用 on_hand')

  const used = new Set([1, 2])
  for (const [name, type, label] of [['on_hand', ScalarType.INT32, 'int32'], ['warehouse_id', ScalarType.STRING, 'string']] as const) {
    const f = StockLevel.fields.find(f => f.name === name)
    assert.ok(f, `StockLevel 要新增 ${name}`)
    assert.ok(f.fieldKind === 'scalar' && f.scalar === type, `StockLevel.${name} 的型別要是 ${label}`)
    assert.ok(!used.has(f.number), `StockLevel.${name} 要用新的編號（不能用 1、2，也不能跟其他新欄位重複）`)
    used.add(f.number)
  }
})

test('舊版程式解得開新版的位元組，available 的值正確', opts, () => {
  const next = load('new'), old = load('old')
  const random = mulberry32(Date.now())
  const qty = 1 + Math.floor(random() * 500)
  const init = { productId: String(1 + Math.floor(random() * 6)), available: qty, onHand: qty, warehouseId: `taipei-${Math.floor(random() * 9)}` }
  const bytes = toBinary(next.StockLevel, create(next.StockLevel, init as never))
  const read = fromBinary(old.StockLevel, bytes) as unknown as { productId: string; available: number }
  assert.equal(read.productId, init.productId, '舊版讀到的 product_id 要正確')
  assert.equal(read.available, qty, '舊版讀到的 available 要是新版填的值：available 的編號與型別都不能動')
})

const expected: Record<string, string> = {
  'add-warehouse-id': 'safe',
  'delete-price-twd': 'needs-reserved',
  'rename-available': 'wire-only-safe',
  'price-to-string': 'breaking',
  'renumber-available': 'breaking',
  'add-enum-value': 'safe',
}

test('compat.md：每個變更的類別', opts, () => {
  const text = readFileSync(join(dir, 'compat.md'), 'utf8')
  const answers = Object.fromEntries([...text.matchAll(/^([a-z-]+):[ \t]*([a-z-]*)/gm)].map(m => [m[1], m[2]]))
  for (const [key, want] of Object.entries(expected)) {
    assert.ok(key in answers, `compat.md 少了「${key}:」這一行，不要刪掉或改名`)
    assert.ok(['safe', 'needs-reserved', 'wire-only-safe', 'breaking'].includes(answers[key]), `${key} 要填 safe、needs-reserved、wire-only-safe、breaking 其中一個（現在是「${answers[key]}」）`)
    assert.equal(answers[key], want, `${key} 的類別不對，回頁面的相容規則表再看一次`)
  }
})
