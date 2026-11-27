// 練習 3：不究責的事後檢討 postmortem.md（只檢查具體的東西，不評文筆）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sections } from '../../helpers/docs.ts'

const dir = import.meta.dirname
const md = readFileSync(join(dir, 'postmortem.md'), 'utf8')
const parts = sections(md)
const section = (title: string) => parts.get(title) ?? ''
const field = (text: string, name: string) => text.match(new RegExp(`^- ${name}：\\s*(.*?)\\s*$`, 'm'))?.[1] ?? ''
const minutes = (hhmm: string) => {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}
// 部署紀錄裡的部署者（第三欄）：檢討裡不能出現
const deployers = readFileSync(join(dir, 'ops/deploys.log'), 'utf8').split('\n')
  .filter(l => /^\d{4}-/.test(l)).map(l => l.split(/\s+/)[2])
  .flatMap(name => [name, name.slice(1)])   // 全名，加上不含姓的名字：只寫名字也是在指人

// 告警看的指標（POST /orders 每分鐘的 p95，nearest-rank）第一次超過 1 秒的那一分鐘，台北時間的分鐘數
function impactStart() {
  const byMinute = new Map<number, number[]>()
  for (const line of readFileSync(join(dir, 'logs/incident.ndjson'), 'utf8').trim().split('\n')) {
    const e = JSON.parse(line)
    if (e.context !== 'HTTP' || e.message.method !== 'POST' || e.message.path !== '/orders') continue
    const minute = Math.floor(e.timestamp / 60_000)
    byMinute.set(minute, [...(byMinute.get(minute) ?? []), e.message.durationMs])
  }
  for (const [minute, list] of [...byMinute].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) => a - b)
    if (sorted[Math.ceil(sorted.length * 0.95) - 1] > 1000) return (minute + 8 * 60) % (24 * 60)
  }
  return NaN
}

describe('練習 3：事後檢討', () => {
  it('四段都在、都有內容，沒有留下 TODO', () => {
    for (const title of ['摘要', '時間線', '根因', '行動項目']) {
      expect(parts.has(title), `postmortem.md 少了「## ${title}」：範本的標題不要改`).toBe(true)
      expect(section(title).trim().length > 0, `「## ${title}」是空的`).toBe(true)
    }
    expect(md.includes('TODO'), 'postmortem.md 還有 TODO 沒填').toBe(false)
  })

  it('時間線：開始影響、偵測、止血、復原依序發生', () => {
    const timeline = section('時間線')
    const [start, detect, mitigate, recover] = ['開始影響', '偵測', '止血', '復原'].map(name => {
      const value = field(timeline, name)
      expect(Number.isNaN(minutes(value)), `時間線的「- ${name}：」要寫 HH:MM（例如 07:58），現在是「${value}」`).toBe(false)
      return minutes(value)
    })
    expect(start, '開始影響要跟練習 1 的 startedAt 是同一分鐘：下單（POST /orders）每分鐘的 p95 第一次超過 1 秒的那一分鐘').toBe(impactStart())
    expect(detect, '偵測＝告警響的時間（ops/alerts.log）').toBe(7 * 60 + 40)
    expect(mitigate > detect, '止血要晚於偵測：先偵測到，才可能止血').toBe(true)
    expect(recover >= mitigate, '復原（索引建好、旗標重新打開、指標回到正常）不會早於止血').toBe(true)
  })

  it('根因指出搜尋端點與缺少的索引', () => {
    const cause = section('根因')
    expect(/\/orders\/search/.test(cause), '根因要寫出是哪個端點：GET /orders/search').toBe(true)
    expect(/索引|index/i.test(cause), '根因要寫出缺了什麼：搜尋的 ILIKE \'%關鍵字%\' 沒有能用的索引').toBe(true)
  })

  it('行動項目：至少 2 項，同時有 prevent 與 detect，每一列都有負責角色', () => {
    const rows = section('行動項目').split('\n').filter(l => l.trim().startsWith('|'))
      .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      .filter(cells => !/^-+$/.test(cells[0].replace(/:/g, '')) && cells[0] !== '項目')
    expect(rows.length, `行動項目要至少 2 項，現在是 ${rows.length} 項：只寫「加強測試」不夠具體，也沒有涵蓋「更早發現」`).toBeGreaterThanOrEqual(2)
    for (const [item, type, owner] of rows) {
      expect(Boolean(item), '行動項目有一列的「項目」是空的').toBe(true)
      expect(['prevent', 'detect'].includes(type), `「${item}」的類型要是 prevent 或 detect，現在是「${type}」`).toBe(true)
      expect(Boolean(owner), `「${item}」沒有負責角色`).toBe(true)
    }
    const types = new Set(rows.map(r => r[1]))
    expect(types.has('prevent') && types.has('detect'), '行動項目要同時有 prevent（避免再發生）與 detect（更早發現）').toBe(true)
  })

  it('不究責：全文沒有部署者的名字', () => {
    for (const name of deployers) {
      expect(md.includes(name), `postmortem.md 出現了「${name}」：寫系統和流程為什麼允許這件事發生，需要指人的地方寫角色（例如「部署的工程師」）`).toBe(false)
    }
  })
})
