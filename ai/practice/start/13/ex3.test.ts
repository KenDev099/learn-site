import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { usage } from '../../helpers/replies.ts'
import { checkCacheHealth } from './ex3.ts'

const near = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}：預期 ${expected}，你的程式算出 ${actual}`)

test('正常命中：第 1 個請求寫入，之後讀取', () => {
  const r = checkCacheHealth([
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
    usage({ input_tokens: 200, cache_read_input_tokens: 4800 }),
    usage({ input_tokens: 300, cache_read_input_tokens: 4700 }),
  ])
  near(r.hitRate, 9500 / 15000, 'hitRate = Σcache_read ÷ Σ(input＋cache_creation＋cache_read)；分母只用 input_tokens 會大於 1')
  assert.equal(r.warning, null, '從第 2 個請求起有命中，不要警告')
})

test('從第 2 個請求起完全沒命中：警告', () => {
  const r = checkCacheHealth([
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
  ])
  near(r.hitRate, 0, '沒有讀取，命中率是 0')
  assert.ok(r.warning?.includes('快取沒有命中'), 'warning 要說明「快取沒有命中，檢查前綴是否有變動的內容」：每次都在寫入、從來沒讀到，代表前綴每次都不同')
  const firstOnly = checkCacheHealth([
    usage({ input_tokens: 100, cache_read_input_tokens: 4900 }),
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
    usage({ input_tokens: 100, cache_creation_input_tokens: 4900 }),
  ])
  assert.ok(firstOnly.warning?.includes('快取沒有命中'),
    '只有第 1 個請求讀到（例如沿用上一次部署留下的快取），第 2 個起全部沒讀到，一樣要警告：只看 usages.slice(1)，第 1 個不算')
})

test('只有一個請求：不警告（第 1 個請求本來就不會命中）', () => {
  const r = checkCacheHealth([usage({ input_tokens: 100, cache_creation_input_tokens: 4900 })])
  assert.equal(r.warning, null, '只有一個請求時沒辦法判斷，不要警告')
  near(r.hitRate, 0, '命中率是 0')
})

test('cache 欄位是 null 時當成 0', () => {
  const r = checkCacheHealth([
    usage({ input_tokens: 1000, cache_creation_input_tokens: null, cache_read_input_tokens: null }),
    usage({ input_tokens: 500, cache_creation_input_tokens: null, cache_read_input_tokens: 1500 }),
  ])
  near(r.hitRate, 1500 / 3000, 'SDK 的型別裡 cache 欄位可能是 null，用 ?? 0 當成 0')
  assert.equal(r.warning, null)
  const none = checkCacheHealth([usage({ input_tokens: 10, cache_read_input_tokens: null }), usage({ input_tokens: 10, cache_read_input_tokens: null })])
  assert.ok(none.warning?.includes('快取沒有命中'), '第 2 個起 cache_read 是 null 也算沒命中')
  assert.ok(Number.isFinite(none.hitRate), 'hitRate 不能是 NaN')
})

test('空陣列：hitRate 0，不警告', () => {
  assert.deepEqual(checkCacheHealth([]), { hitRate: 0, warning: null }, '分母是 0 時回 0，不要回 NaN')
})
