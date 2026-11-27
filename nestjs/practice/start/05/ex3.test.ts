// 練習 3：你寫的 src/pricing.service.spec.ts 要測快樂時光的邊界，而且在任何時區執行結果都一樣
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMutants } from '../../helpers/mutants.ts'

function stage(spec: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learn-nest05-'))
  cpSync(import.meta.dirname, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) && (!f.endsWith('.spec.ts') || f.endsWith('/' + spec)) })
  return dir
}

const file = 'src/pricing.service.ts'
const REFACTOR = '重構（行為不變，測試要照樣通過）'
const swap = (from: string, to: string) => ({ [file]: (code: string) => {
  if (!code.includes(from)) throw new Error(`src/pricing.service.ts 被改過了，找不到「${from}」：這一題只寫測試，不要改 pricing.service.ts`)
  return code.replace(from, to)
} })
const hourOf = (expr: string) => swap(
  "return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' }).format(date))",
  `return ${expr}`)

// 在指定時區（TZ）跑你的測試：子程序會繼承這裡的環境變數
function inZone(tz: string, mutants: Parameters<typeof runMutants>[1]) {
  const before = process.env.TZ
  process.env.TZ = tz
  const dir = stage('pricing.service.spec.ts')
  try {
    return runMutants(dir, mutants)
  } catch (e) {
    throw new Error(`用 TZ=${tz} 執行你的測試時：${(e as Error).message}\n提示：new Date(2026, 9, 31, 14) 是「執行測試那台電腦的 14 點」，換個時區就是另一個瞬間。寫成 new Date('2026-10-31T14:00:00+08:00')`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

describe('練習 3：快樂時光的邊界測試', () => {
  it('在台北時區：抓得到每一個改壞的邊界', () => {
    const r = inZone('Asia/Taipei', {
      '16:00 也算快樂時光': swap('hour < 16', 'hour <= 16'),
      '15:00 就結束': swap('hour < 16', 'hour < 15'),
      '14:00 整還不算': swap('hour >= 14', 'hour > 14'),
      '13:00 就開始': swap('hour >= 14', 'hour >= 13'),
      '食物也打折': swap("item.category === 'drink' && ", ''),
      '用 UTC 的小時': hourOf('date.getUTCHours()'),
      '飲品打成九折': swap('item.price * 0.8', 'item.price * 0.9'),
      [REFACTOR]: swap('hour >= 14 && hour < 16', '14 <= hour && hour <= 15'),
    })
    expect(r.killed, `把條件改寫成 14 <= hour && hour <= 15、行為完全一樣的 PricingService，你的測試卻失敗了。測試要檢查 priceOf 的結果，不要比對原始碼`).not.toContain(REFACTOR)
    const missed = r.survived.filter(n => n !== REFACTOR)
    expect(missed, `沒抓到的版本：${missed.join('、')}。這些故意改壞的 PricingService，你的測試都沒有失敗。邊界兩側都要測：13:59:59、14:00:00、15:59:59、16:00:00，價格要比對確切的金額`).toEqual([])
  }, 120_000)

  it('在 UTC 時區（多數 CI 機器）：結果一樣，也抓得到「用伺服器時區算小時」', () => {
    const r = inZone('UTC', { '用伺服器所在時區的小時': hourOf('date.getHours()') })
    expect(r.survived, `沒抓到的版本：${r.survived.join('、')}。程式改成用伺服器時區算小時，你的測試在 UTC 機器上沒有失敗：測試裡的時間要寫成帶 +08:00 的固定瞬間，不要依賴執行測試的電腦時區或現在時間`).toEqual([])
  }, 120_000)
})
