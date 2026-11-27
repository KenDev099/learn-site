import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { usage } from '../../helpers/replies.ts'
import { costOf } from './ex1.ts'

const near = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${msg}：預期 ${expected}，你的程式算出 ${actual}`)

test('只有 input 與 output：Opus 5.5 輸入 $4、輸出 $20／百萬 token', () => {
  near(costOf(usage({ input_tokens: 1000, output_tokens: 500 }), 'claude-opus-5-5'), 0.014, '1000×4＋500×20 再除以 1,000,000（單價是每「百萬」token）')
  near(costOf(usage({ input_tokens: 0, output_tokens: 0 }), 'claude-opus-5-5'), 0, '0 token 要是 0 元')
  near(costOf(usage({ input_tokens: 1, output_tokens: 0 }), 'claude-opus-5-5'), 0.000004, '1 個輸入 token')
  near(costOf(usage({ input_tokens: 0, output_tokens: 1000 }), 'claude-sonnet-5-5'), 0.01, '輸出要用 output 的單價（Sonnet 5.5 是 $10）')
})

test('快取寫入（5 分鐘 TTL）用 write5m：Opus 5.5 是 $5', () => {
  const u = usage({ input_tokens: 50, cache_creation_input_tokens: 10000, output_tokens: 300 })
  near(costOf(u, 'claude-opus-5-5'), 0.0562, 'cache_creation_input_tokens 是另外計費的，不包含在 input_tokens 裡：50×4＋10000×5＋300×20')
  near(costOf(u, 'claude-opus-5-5', { cacheTtl: '5m' }), 0.0562, "cacheTtl: '5m' 跟預設一樣")
})

test('快取讀取用 cacheRead：Opus 5.5 是 $0.20（輸入價的 0.05 倍，不是 0.1 倍）', () => {
  near(costOf(usage({ input_tokens: 50, cache_read_input_tokens: 10000, output_tokens: 300 }), 'claude-opus-5-5'), 0.0082, '50×4＋10000×0.2＋300×20')
  near(costOf(usage({ input_tokens: 100, cache_read_input_tokens: 20000, output_tokens: 1000 }), 'claude-sonnet-5-5'), 0.0122, 'Sonnet 5.5：100×2＋20000×0.1＋1000×10')
})

test("1 小時 TTL 的寫入用 write1h（輸入價 2 倍）", () => {
  const u = usage({ input_tokens: 50, cache_creation_input_tokens: 10000, output_tokens: 300 })
  near(costOf(u, 'claude-opus-5-5', { cacheTtl: '1h' }), 0.0862, "cacheTtl: '1h' 時寫入是 $8（2 倍），不是 1.25 倍")
})

test('cache 欄位是 null 時當成 0', () => {
  const u = usage({ input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: null, cache_read_input_tokens: null })
  near(costOf(u, 'claude-opus-5-5'), 0.014, 'SDK 的型別是 number | null：用 ?? 0 把 null 當成 0')
})

test('Haiku 5.5：prompt 剛好 10 萬 token 用一般價，超過 1 token 整個請求改用長 prompt 價', () => {
  near(costOf(usage({ input_tokens: 40000, cache_read_input_tokens: 60000, output_tokens: 1000 }), 'claude-haiku-5-5'), 0.0051,
    'prompt = 40000＋60000 = 100,000，沒有「超過」，用一般價：40000×0.1＋60000×0.01＋1000×0.5')
  near(costOf(usage({ input_tokens: 40001, cache_read_input_tokens: 60000, output_tokens: 1000 }), 'claude-haiku-5-5'), 0.025501,
    'prompt = input＋cache_creation＋cache_read = 100,001，超過 10 萬：全部（含輸出、快取讀取）改用 HAIKU_LONG，四捨五入到小數第 6 位')
  near(costOf(usage({ input_tokens: 1000, cache_creation_input_tokens: 99001, output_tokens: 0 }), 'claude-haiku-5-5'), 0.062376,
    '快取寫入的 token 也算在 prompt 長度裡：1000＋99001 > 100,000，用 HAIKU_LONG（1000×0.5＋99001×0.625）')
})

test('batch：全部打 5 折，跟快取倍率疊加', () => {
  near(costOf(usage({ input_tokens: 1000, cache_read_input_tokens: 50000, output_tokens: 2000 }), 'claude-opus-5-5', { batch: true }), 0.027,
    '(1000×4＋50000×0.2＋2000×20) × 0.5：輸入、快取、輸出都要打折')
  near(costOf(usage({ input_tokens: 1234567, output_tokens: 7654 }), 'claude-sonnet-5-5', { batch: true }), 1.272837,
    '1234567×2＋7654×10 再 ×0.5，四捨五入到小數第 6 位')
})

test('結果四捨五入到小數第 6 位', () => {
  const v = costOf(usage({ input_tokens: 3, output_tokens: 7 }), 'claude-haiku-5-5')
  assert.equal(v, 0.000004, '3×0.1＋7×0.5 = 3.8 微美元，四捨五入成 0.000004（Math.round(usd * 1e6) / 1e6）')
})

test('沒有寫死價格：用 prices.ts 的 PRICES', () => {
  const src = readFileSync(new URL('./ex1.ts', import.meta.url), 'utf8')
  assert.match(src, /PRICES/, '單價從 prices.ts 的 PRICES 讀，價格變了只改一個地方')
})
