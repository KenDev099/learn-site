import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { useEs } from '../../helpers/es.ts'
import { MENU, seedMenu } from './menu.ts'
import { searchMenu } from './search.ts'
import { evaluate, type Case } from './relevance.ts'

const es = useEs(10)
const index = 't10-ex4-menu'
const shifted = 't10-ex4-shifted'   // 同樣的菜單，id 全部加 100：寫死 id 的程式在這裡會錯
before(async () => {
  await seedMenu(es, index)
  await seedMenu(es, shifted, 100)
})
const name = (id: string) => MENU.find(m => m.id === String(Number(id) % 100))?.name ?? id

// 隱藏案例：店長和客服整理的「搜這個，第一個應該看到它」
const HIDDEN: Case[] = [
  { q: '拿鐵', expect: '11' },
  { q: '冰拿鐵', expect: '12' },
  { q: 'latte', expect: '11' },
  { q: '起士蛋糕', expect: '30' },   // 錯字：起士 → 起司；靠「蛋糕」這個詞，再由銷量決定
  { q: '焦糖', expect: '14' },
  { q: '抹茶', expect: '32' },       // 抹茶拿鐵與抹茶蛋糕的文字分數一樣，抹茶蛋糕賣得比較好
  { q: '貝果', expect: '41' },       // 蔬菜貝果與起司貝果的文字分數一樣，起司貝果賣得比較好
]

describe('練習 4：相關性案例與 Precision@1', { timeout: 30_000 }, () => {
  test('cases.json：至少 6 組、q 不重複、expect 是菜單裡的 id', () => {
    const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as Case[]
    assert.ok(Array.isArray(cases) && cases.length >= 6, `cases.json 至少要 6 組，實際 ${Array.isArray(cases) ? cases.length : '不是陣列'}`)
    const qs = cases.map(c => c.q)
    assert.equal(new Set(qs).size, qs.length, 'q 不能重複')
    for (const c of cases) {
      assert.ok(typeof c.q === 'string' && c.q.trim(), '每一組都要有 q（搜尋字）')
      assert.ok(MENU.some(m => m.id === c.expect), `expect "${c.expect}" 不是菜單裡的 id（要是字串，例如 "11"）`)
    }
  })

  test('evaluate 算出 Precision@1', async () => {
    const half: Case[] = [{ q: '可頌', expect: '29' }, { q: '可頌', expect: '46' }, { q: '伯爵紅茶', expect: '22' }, { q: '伯爵紅茶', expect: '10' }]
    assert.equal(await evaluate(es, index, half), 0.5, '4 組裡有 2 組的第一名對，Precision@1 是 0.5')
    assert.equal(await evaluate(es, index, [{ q: '可頌', expect: '46' }]), 0, '第一名不是 expect 時不算')
    assert.equal(await evaluate(es, shifted, [{ q: '可頌', expect: '129' }]), 1, 'evaluate 要用傳入的 index 查詢')
  })

  test('自己的案例全中', async () => {
    const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as Case[]
    for (const c of cases) {
      const [first] = await searchMenu(es, index, { q: c.q })
      assert.equal(first?.id, c.expect, `cases.json：搜「${c.q}」期望第一名是 ${name(c.expect)}（${c.expect}），實際是 ${first ? `${first.name}（${first.id}）` : '沒有結果'}`)
    }
    assert.equal(await evaluate(es, index, cases), 1)
  })

  test('隱藏案例全中（在 id 位移過的索引上也一樣）', async () => {
    for (const [idx, offset] of [[index, 0], [shifted, 100]] as const) {
      for (const c of HIDDEN) {
        const expect = String(Number(c.expect) + offset)
        const hits = await searchMenu(es, idx, { q: c.q })
        assert.equal(hits[0]?.id, expect,
          `搜「${c.q}」期望第一名是 ${name(c.expect)}，實際前三名：${hits.slice(0, 3).map(h => `${h.name}(${h.score.toFixed(2)})`).join('、') || '沒有結果'}。` +
          (offset ? '（這個索引的 id 都加了 100：不要依查詢字串寫死結果）' : '文字分數一樣時，讓銷量高的排前面：用 function_score 把 sales 加進分數'))
      }
      assert.equal(await evaluate(es, idx, HIDDEN.map(c => ({ q: c.q, expect: String(Number(c.expect) + offset) }))), 1)
    }
  })
})
