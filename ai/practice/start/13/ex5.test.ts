import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DailyBudget } from './ex5.ts'

function clock(iso: string) {
  let t = new Date(iso)
  return { now: () => t, set: (s: string) => { t = new Date(s) } }
}

test('送出前檢查：今天已花的＋這次的估計 ≤ 上限才可以送（剛好等於也可以）', () => {
  const c = clock('2026-11-01T02:00:00Z')
  const b = new DailyBudget(1, c.now)
  assert.equal(b.canSpend('u1', 0.25), true, '還沒花錢，0.25 美元可以送')
  b.record('u1', 0.5)
  assert.equal(b.spent('u1'), 0.5, 'record 要累加實際費用')
  assert.equal(b.canSpend('u1', 0.5), true, '0.5＋0.5 剛好等於上限 1，還可以送')
  assert.equal(b.canSpend('u1', 0.75), false, '0.5＋0.75 超過上限：要把這次的估計算進去，不能只看已經花的')
  b.record('u1', 0.25)
  assert.equal(b.spent('u1'), 0.75)
  assert.equal(b.canSpend('u1', 0.5), false, '0.75＋0.5 超過上限')
})

test('不同顧客分開算：一個人用完不影響別人', () => {
  const c = clock('2026-11-01T02:00:00Z')
  const b = new DailyBudget(1, c.now)
  b.record('u1', 1)
  assert.equal(b.canSpend('u1', 0.25), false)
  assert.equal(b.canSpend('u2', 0.25), true, 'u2 還沒花錢：預算要依 userId 分開記')
  assert.equal(b.spent('u2'), 0, '沒有紀錄的顧客已花 0 元')
})

test('台北時間隔天重新計算（台北午夜是 UTC 16:00）', () => {
  const c = clock('2026-11-01T15:59:00Z')   // 台北 11/01 23:59
  const b = new DailyBudget(1, c.now)
  b.record('u1', 1)
  assert.equal(b.canSpend('u1', 0.25), false, '同一天用完了')
  c.set('2026-11-01T16:00:00Z')               // 台北 11/02 00:00，UTC 還是 11/01
  assert.equal(b.spent('u1'), 0, '台北已經是隔天：用 taipeiDay(now()) 當 key 的一部分；用 UTC 日期要到早上 8 點才重置')
  assert.equal(b.canSpend('u1', 0.25), true)
  b.record('u1', 0.25)
  c.set('2026-11-01T15:00:00Z')               // 回到台北 11/01
  assert.equal(b.spent('u1'), 1, '每天的花費各自記，不要在換日時把前一天的覆蓋掉')
})

test('「今天」用傳進來的 now()', () => {
  const src = readFileSync(new URL('./ex5.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /Date\.now\(\)|new Date\(\s*\)/, '不要用 Date.now() 或 new Date()：用建構時傳入的 now()，測試才能控制時間')
})
