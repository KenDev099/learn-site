import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILE = 'docs/adr-001-data-stores.md'
const md = readFileSync(new URL(`./${FILE}`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

// 依 ## 標題切段
const sections = new Map<string, string>()
for (const part of md.split(/^## /m).slice(1)) {
  const [title, ...body] = part.split('\n')
  sections.set(title.trim(), body.join('\n'))
}

// 找出表頭有這五欄的表格，轉成 [{ 資料, 儲存, … }]
const COLS = ['資料', '儲存', '記錄系統', '重建方式', '可接受遺失']
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
function table(): Record<string, string>[] {
  const lines = md.split('\n')
  const h = lines.findIndex(l => l.trim().startsWith('|') && COLS.every(c => cells(l).includes(c)))
  if (h < 0) return []
  const head = cells(lines[h])
  const rows: Record<string, string>[] = []
  for (const l of lines.slice(h + 2)) {
    if (!l.trim().startsWith('|')) break
    const v = cells(l)
    rows.push(Object.fromEntries(head.map((c, i) => [c, v[i] ?? ''])))
  }
  return rows
}
const yes = (s: string) => s.startsWith('是')
const no = (s: string) => s.startsWith('否')

describe('練習 1：選型 ADR', { timeout: 30_000 }, () => {
  test('有背景、決定、替代方案、後果、重新評估的條件五節，每一節都有內容', () => {
    for (const name of ['背景', '決定', '替代方案', '後果', '重新評估的條件']) {
      assert.ok(sections.has(name), `${FILE} 缺少「## ${name}」這一節（標題要一字不差）`)
      const text = sections.get(name)!.replace(/^\|.*$/gm, '').replace(/\s/g, '')
      assert.ok(text.length >= 15, `「## ${name}」只有 ${text.length} 個字：寫出具體的內容（HTML 註解不算）`)
    }
  })

  test('儲存表至少 5 列，記錄系統、可接受遺失兩欄用「是」或「否」開頭', () => {
    const rows = table()
    assert.ok(rows.length >= 5, `儲存表（表頭 ${COLS.join('｜')}）要至少 5 列，現在 ${rows.length} 列：訂單、商品、購物車、限流／冪等、搜尋索引、收據各寫一列`)
    for (const r of rows) {
      assert.ok(yes(r['記錄系統']) || no(r['記錄系統']), `「${r['資料']}」的記錄系統欄要用「是」或「否」開頭，現在是「${r['記錄系統']}」`)
      assert.ok(yes(r['可接受遺失']) || no(r['可接受遺失']), `「${r['資料']}」的可接受遺失欄要用「是」或「否」開頭，現在是「${r['可接受遺失']}」`)
      assert.ok(r['重建方式'].length >= 4, `「${r['資料']}」沒有寫重建方式（記錄系統寫「從備份還原」，衍生資料寫從哪裡、怎麼重建）`)
    }
  })

  test('訂單的記錄系統是 PostgreSQL；Redis、Elasticsearch 都不是記錄系統', () => {
    const rows = table()
    const orders = rows.filter(r => /訂單|orders/i.test(r['資料']))
    assert.ok(orders.length > 0, '儲存表要有訂單（資料欄寫「訂單」）那一列')
    for (const r of orders) {
      assert.match(r['儲存'], /postgres/i, `訂單要放 PostgreSQL，現在是「${r['儲存']}」`)
      assert.ok(yes(r['記錄系統']), '訂單的記錄系統欄要是「是」：它是唯一的權威資料')
      assert.ok(no(r['可接受遺失']), '訂單不能接受遺失')
    }
    for (const r of rows.filter(r => /redis|elasticsearch|opensearch/i.test(r['儲存']))) {
      assert.ok(no(r['記錄系統']), `「${r['資料']}」放在 ${r['儲存']}，記錄系統欄要是「否」：Redis、搜尋索引是衍生資料，權威在 PostgreSQL`)
    }
  })

  test('購物車標示可接受遺失；搜尋索引寫出重建方式', () => {
    const rows = table()
    const cart = rows.find(r => r['資料'].includes('購物車'))
    assert.ok(cart, '儲存表要有購物車那一列')
    assert.ok(yes(cart['可接受遺失']), `購物車的可接受遺失要是「是」（並寫出影響），現在是「${cart['可接受遺失']}」`)
    assert.ok(no(cart['記錄系統']), '購物車不是記錄系統')
    const search = rows.find(r => /搜尋/.test(r['資料']))
    assert.ok(search, '儲存表要有搜尋索引那一列（資料欄寫「菜單搜尋索引」之類）')
    assert.ok(no(search['記錄系統']), '搜尋索引不是記錄系統')
    assert.match(search['重建方式'], /postgres|products|資料庫/i, `搜尋索引的重建方式要寫出「從 PostgreSQL（products）重建」，現在是「${search['重建方式']}」`)
  })
})
