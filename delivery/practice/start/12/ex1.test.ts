// 練習 1：從 log 與部署紀錄定位事故，填 incident.json
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const read = (file: string) => readFileSync(join(dir, file), 'utf8')

// 從 log 算出「POST /orders 每分鐘的 p95 第一次超過 1 秒」的那一分鐘（p95 用 nearest-rank：排序後第 ceil(0.95 × n) 個）
function impactStart() {
  const byMinute = new Map<number, number[]>()
  for (const line of read('logs/incident.ndjson').trim().split('\n')) {
    const e = JSON.parse(line)
    if (e.context !== 'HTTP' || e.message.method !== 'POST' || e.message.path !== '/orders') continue
    const minute = Math.floor(e.timestamp / 60_000) * 60_000
    byMinute.set(minute, [...(byMinute.get(minute) ?? []), e.message.durationMs])
  }
  for (const [minute, list] of [...byMinute].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) => a - b)
    if (sorted[Math.ceil(sorted.length * 0.95) - 1] > 1000) return minute
  }
  throw new Error('logs/incident.ndjson 被改過了：找不到 p95 超過 1 秒的分鐘')
}

const incident = (() => {
  try {
    return JSON.parse(read('incident.json'))
  } catch (e) {
    throw new Error(`incident.json 不是合法的 JSON：${(e as Error).message}`)
  }
})()
const taipei = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(11, 16)

describe('練習 1：定位事故', () => {
  it('四個欄位都填了（沒有 TODO）', () => {
    for (const key of ['startedAt', 'slowRoute', 'deploy', 'rootCause']) {
      expect(typeof incident[key] === 'string' && !incident[key].includes('TODO'), `incident.json 的 ${key} 還沒填`).toBe(true)
    }
  })

  it('startedAt：下單的 p95 第一次超過 1 秒的那一分鐘（含時區）', () => {
    const value: string = incident.startedAt
    expect(/(Z|[+-]\d\d:\d\d)$/.test(value), `startedAt「${value}」要帶時區，例如 2026-11-16T07:00:00+08:00：沒有時區的時間，不同的程式會用不同的時區解讀`).toBe(true)
    const ms = Date.parse(value)
    expect(Number.isNaN(ms), `startedAt「${value}」不是 ISO 8601 時間`).toBe(false)
    const start = impactStart()
    expect(ms >= start && ms < start + 60_000, `startedAt 是台北時間 ${taipei(ms)}，不在 log 算出來的那一分鐘裡。影響開始＝告警看的那個指標（POST /orders 每分鐘的 p95，nearest-rank）第一次超過 1 秒的那一分鐘，不是第一個慢的請求，也不是告警響的時間；前一分鐘的 p95 還沒超過 1 秒`).toBe(true)
  })

  it('slowRoute：拖慢系統的路由（方法＋路徑，不含查詢字串）', () => {
    const route = String(incident.slowRoute).trim()
    expect(route, '被拖慢的是下單，但下單本身沒有變更；找出部署之後才出現、每次都很慢的那個路由').not.toBe('POST /orders')
    expect(route.includes('?'), 'slowRoute 不含 ? 後面的查詢字串：同一個路由的 q 每次都不一樣，要先去掉再分組').toBe(false)
    expect(route, 'slowRoute 的格式是「方法 路徑」，例如 GET /products；路由要從 log 依路徑分組後找出最慢、而且是部署之後才出現的那一個').toBe('GET /orders/search')
  })

  it('deploy：跟事故時間對得上的那次部署', () => {
    expect(String(incident.deploy).trim(), '對照 ops/deploys.log：哪一次部署之後一分鐘，新的路由開始出現、系統開始變慢').toBe('v2.8.0')
  })

  it('rootCause：原因，不是症狀', () => {
    const cause = incident.rootCause
    expect(['missing-index', 'cpu-high', 'pool-too-small', 'bad-network'].includes(cause), `rootCause 要是四個選項之一，現在是「${cause}」`).toBe(true)
    expect(['cpu-high', 'pool-too-small'].includes(cause), `${cause} 是症狀：CPU 滿、連線池滿都是「每個搜尋都掃整張表」造成的結果。問自己「CPU 為什麼滿？」再往下找一層`).toBe(false)
    expect(cause, '網路沒有問題：只有資料庫變忙。搜尋的查詢用 EXPLAIN 看看它怎麼找資料').toBe('missing-index')
  })
})
