import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ScalarType, type DescFile, type DescMessage } from '@bufbuild/protobuf'

const opts = { timeout: 30_000 }
const dir = import.meta.dirname
const buf = join(dir, '../../node_modules/.bin/buf')

async function loadFile(): Promise<DescFile> {
  assert.ok(existsSync(join(dir, 'proto/coffee/inventory/v1/inventory.proto')), '檔案要放在 proto/coffee/inventory/v1/inventory.proto（路徑要跟 package coffee.inventory.v1 對應）')
  try {
    const mod = await import('./gen/coffee/inventory/v1/inventory_pb.js')
    return mod.file_coffee_inventory_v1_inventory
  } catch (e) {
    assert.fail(`讀不到 buf generate 產生的 gen/coffee/inventory/v1/inventory_pb.js：${(e as Error).message}`)
  }
}

function message(file: DescFile, name: string): DescMessage {
  const m = file.messages.find(m => m.name === name)
  assert.ok(m, `要有 message ${name}`)
  return m
}

function field(m: DescMessage, name: string, no: number) {
  const f = m.fields.find(f => f.name === name)
  assert.ok(f, `${m.name} 要有 ${name} 欄位（欄位名稱用 lower_snake_case）`)
  assert.equal(f.number, no, `${m.name}.${name} 的欄位編號要是 ${no}`)
  return f
}

function scalar(m: DescMessage, name: string, no: number, type: ScalarType, label: string) {
  const f = field(m, name, no)
  assert.equal(f.fieldKind, 'scalar', `${m.name}.${name} 要是單一的 ${label}（不是 repeated、map 或 message）`)
  assert.equal(f.scalar, type, `${m.name}.${name} 的型別要是 ${label}`)
  return f
}

test('buf lint（STANDARD）沒有任何問題', opts, () => {
  const r = spawnSync(buf, ['lint'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, `npx buf lint 回報了問題，照訊息修改（檔名:行:欄 是位置）：\n${(r.stdout + r.stderr).trim()}`)
})

test('package 與 enum Category', opts, async () => {
  const file = await loadFile()
  assert.equal(file.proto.package, 'coffee.inventory.v1', 'package 要是 coffee.inventory.v1：最後一段 v1 是版本，之後才有地方放不相容的 v2')
  const e = file.enums.find(e => e.name === 'Category')
  assert.ok(e, '要有 enum Category')
  assert.deepEqual(e.values.map(v => [v.name, v.number]),
    [['CATEGORY_UNSPECIFIED', 0], ['CATEGORY_COFFEE', 1], ['CATEGORY_TEA', 2], ['CATEGORY_FOOD', 3]],
    'Category 依序是 CATEGORY_UNSPECIFIED = 0、CATEGORY_COFFEE = 1、CATEGORY_TEA = 2、CATEGORY_FOOD = 3：第一個值一定是 0，代表「沒設定」')
})

test('Product 的欄位', opts, async () => {
  const m = message(await loadFile(), 'Product')
  scalar(m, 'id', 1, ScalarType.STRING, 'string')
  scalar(m, 'name', 2, ScalarType.STRING, 'string')
  const category = field(m, 'category', 3)
  assert.ok(category.fieldKind === 'enum' && category.enum.name === 'Category', 'Product.category 的型別要是 enum Category')
  scalar(m, 'price_twd', 4, ScalarType.INT32, 'int32（新台幣整數元；金額不要用 float、double）')
  assert.equal(m.fields.length, 4, 'Product 只要 id、name、category、price_twd 四個欄位')
})

test('StockLevel：reorder_point 要分得出「沒設定」和 0', opts, async () => {
  const m = message(await loadFile(), 'StockLevel')
  scalar(m, 'product_id', 1, ScalarType.STRING, 'string')
  const available = scalar(m, 'available', 2, ScalarType.INT32, 'int32')
  assert.equal(available.proto.proto3Optional, false, 'available 不需要 optional：沒給就是 0 件')
  const reorder = scalar(m, 'reorder_point', 3, ScalarType.INT32, 'int32')
  assert.equal(reorder.proto.proto3Optional, true, 'reorder_point 要加 optional：「補貨點是 0」和「沒設定補貨點」意思不同，沒有 optional 時兩者在線上格式一模一樣')
  assert.equal(m.fields.length, 3, 'StockLevel 只要 product_id、available、reorder_point 三個欄位')
})

test('GetStockRequest 與 GetStockResponse', opts, async () => {
  const file = await loadFile()
  const req = message(file, 'GetStockRequest')
  const ids = field(req, 'product_ids', 1)
  assert.ok(ids.fieldKind === 'list' && ids.scalar === ScalarType.STRING, 'GetStockRequest.product_ids 要是 repeated string：一次查好幾個商品')
  assert.equal(req.fields.length, 1, 'GetStockRequest 只要 product_ids')
  const res = message(file, 'GetStockResponse')
  const levels = field(res, 'levels', 1)
  assert.ok(levels.fieldKind === 'map' && levels.mapKey === ScalarType.STRING && levels.mapKind === 'message' && levels.message.name === 'StockLevel',
    'GetStockResponse.levels 要是 map<string, StockLevel>：key 是商品 id')
  assert.equal(res.fields.length, 1, 'GetStockResponse 只要 levels')
})
