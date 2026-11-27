import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { rrf } from './ex1.ts'

const close = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${msg}（預期 ${expected}，你的是 ${actual}）`)

test('兩路合併：分數是每一路 1/(k+名次) 的加總，第 1 名的名次是 1', () => {
  const r = rrf([['a', 'b', 'c'], ['b', 'd']])
  assert.deepEqual(r.map(x => x.id), ['b', 'a', 'd', 'c'], 'b 在兩路都有（第 2 名、第 1 名），要排第一；a 只在向量那一路但是第 1 名')
  close(r[0].score, 1 / 62 + 1 / 61, 'b 的分數是 1/(60+2) + 1/(60+1)：名次從 1 開始，不是 0')
  close(r[1].score, 1 / 61, 'a 只在第一路的第 1 名：1/(60+1)')
  close(r[2].score, 1 / 62, 'd 只在第二路的第 2 名：1/(60+2)')
  close(r[3].score, 1 / 63, 'c 只在第一路的第 3 名：1/(60+3)')
})

test('只出現在其中一路的 id 也要留下來', () => {
  const ids = rrf([['x'], ['y'], []]).map(x => x.id)
  assert.deepEqual(ids, ['x', 'y'], '混合搜尋的重點就是「只有一邊找得到的也能被選上」，不能只留兩路都有的')
})

test('k 可以調整，三路也能合併', () => {
  const r = rrf([['a', 'b'], ['b', 'a'], ['c', 'b']], 1)
  assert.deepEqual(r.map(x => x.id), ['b', 'a', 'c'])
  close(r[0].score, 1 / 3 + 1 / 2 + 1 / 3, 'k = 1 時 b 是 1/(1+2) + 1/(1+1) + 1/(1+2)：要用傳進來的 k')
  close(r[1].score, 1 / 2 + 1 / 3, 'a 是 1/(1+1) + 1/(1+2)')
  close(r[2].score, 1 / 2, 'c 是 1/(1+1)')
})

test('同分依 id 的字串順序', () => {
  assert.deepEqual(rrf([['m', 'z'], ['b', 'a']]).map(x => x.id), ['b', 'm', 'a', 'z'], 'b 與 m 都是第 1 名（同分），a 與 z 都是第 2 名：同分時 id 小的排前面')
})

test('同一路裡重複的 id 只算第一次出現的名次', () => {
  const r = rrf([['a', 'b', 'a', 'a']])
  assert.equal(r.length, 2)
  close(r.find(x => x.id === 'a')!.score, 1 / 61, '同一路重複出現的 a 只算一次（第 1 名），不能加總三次')
  close(r.find(x => x.id === 'b')!.score, 1 / 62, 'b 的名次還是 2：名次照原本清單的位置算')
})

test('沒有任何結果時回傳空陣列', () => {
  assert.deepEqual(rrf([]), [])
  assert.deepEqual(rrf([[], []]), [])
})
