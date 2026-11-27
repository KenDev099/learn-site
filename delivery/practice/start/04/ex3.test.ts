// 練習 3：release-plan.json 的發布順序
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const plan = JSON.parse(readFileSync(join(dir, 'release-plan.json'), 'utf8'))
const ORDER = ['deploy-api-both', 'deploy-web-new', 'wait-old-field-zero', 'remove-old-field']
const sources = (sub: string): string[] => readdirSync(join(dir, sub), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? (e.name === 'generated' ? [] : sources(join(sub, e.name))) : e.name.endsWith('.ts') ? [join(sub, e.name)] : [])

describe('練習 3：release-plan.json', () => {
  it('四個步驟的順序', () => {
    const steps = (plan.steps ?? []).map((s: { step: string }) => s.step)
    for (const s of steps) expect(ORDER, `step 只能是 ${ORDER.join('、')} 其中一個，「${s}」不是`).toContain(s)
    expect(steps.length, '四個步驟各出現一次').toBe(4)
    expect(steps.indexOf('deploy-api-both') < steps.indexOf('deploy-web-new'), '新前端會送 customerNote：如果它先上線，線上還是舊 API，備註會被丟掉。API 要先上').toBe(true)
    expect(steps.indexOf('wait-old-field-zero') < steps.indexOf('remove-old-field'), '移除舊欄位之前要先等舊欄位的使用量歸零').toBe(true)
    expect(steps, `順序要是 ${ORDER.join(' → ')}`).toEqual(ORDER)
  })

  it('每一步都寫了為什麼安全', () => {
    for (const s of plan.steps ?? []) {
      expect(typeof s.safeBecause === 'string' && s.safeBecause.trim() !== '' && !/TODO/.test(s.safeBecause), `${s.step} 的 safeBecause 還沒填`).toBe(true)
    }
  })

  it('watchLog 是練習 2 真的會寫出來的那行 warn log；quietDays 是正整數', () => {
    const watch = plan.watchLog
    expect(typeof watch === 'string' && !/TODO/.test(watch), 'watchLog 要填練習 2 收到舊欄位時寫的 warn log 裡的一段固定文字').toBe(true)
    expect(watch.trim().length >= 8 && watch.includes('note'), `watchLog「${watch}」太短或沒有 note：在 log 系統搜尋它時要只找到舊欄位那一行，例如 warn log 裡固定的「legacy field note」（至少 8 個字、含 note）`).toBe(true)
    // 每個 warn( 呼叫的參數（可以換行）裡要有這段文字；${…} 換成空白，動態的值不算固定文字
    const calls = sources('api/src').flatMap(f => [...readFileSync(join(dir, f), 'utf8').matchAll(/\bwarn\(([\s\S]*?)\)\s*(?:;|\n)/g)].map(m => m[1].replace(/\$\{[^}]*\}/g, ' ')))
    expect(calls.some(c => c.includes(watch)), `api/src 裡找不到含「${watch}」的 warn(…) 呼叫：watchLog 要能在 log 裡搜得到，從練習 2 的 logger.warn 複製一段固定的文字（不要包含 \${…} 的部分）`).toBe(true)
    expect(Number.isInteger(plan.quietDays) && plan.quietDays >= 1, 'quietDays：舊欄位的 log 連續幾天是 0 才移除，要是正整數').toBe(true)
  })
})
