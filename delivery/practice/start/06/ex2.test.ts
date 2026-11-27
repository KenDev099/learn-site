// 練習 2：pickupLabel 在任何伺服器時區下都印出台北時間
// 同一組案例分別在 TZ=UTC、America/New_York、Asia/Taipei 的程序裡跑，結果要全部相同而且正確
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const FILE = join(dir, 'api/src/pickup/pickup-label.ts')
const VITEST = join(dir, '../../node_modules/vitest/vitest.mjs')
const probe = `${dir}-tz`   // 放在 work/ 底下才找得到套件
const CASES: [string, string][] = [
  ['2026-11-04T00:15:00Z', '11/04 08:15'],
  ['2026-11-03T10:45:00Z', '11/03 18:45'],
  ['2026-11-03T23:30:00Z', '11/04 07:30'],   // UTC 還是 3 號，台北已經是 4 號
  ['2026-11-03T15:59:00Z', '11/03 23:59'],
  ['2026-12-31T16:00:00Z', '01/01 00:00'],   // 跨年
]
// 再加一年裡每隔 7 小時 13 分的時間點，避免只對上面幾個例子寫死。台北全年 UTC+8、沒有夏令時間，期待值用 +8 小時的 UTC 欄位算
const pad = (n: number) => String(n).padStart(2, '0')
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += (7 * 60 + 13) * 60_000) {
  const d = new Date(t + 8 * 3600_000)
  CASES.push([new Date(t).toISOString(), `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`])
}

type Probe = { labels: string[], tz?: string, zone: string }
function labelsIn(tz: string): { probe?: Probe, output: string } {
  rmSync(probe, { recursive: true, force: true })
  mkdirSync(probe)
  const out = join(probe, 'labels.json')
  writeFileSync(join(probe, 'labels.spec.ts'), `
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { pickupLabel } from ${JSON.stringify(FILE)}
it('labels', () => {
  const labels = ${JSON.stringify(CASES.map(c => c[0]))}.map(s => pickupLabel(new Date(s)))
  writeFileSync(${JSON.stringify(out)}, JSON.stringify({ labels, tz: process.env.TZ, zone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
})
`)
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST'))), TZ: tz }
  const r = spawnSync(process.execPath, [VITEST, 'run', '--root', probe], { cwd: probe, env, encoding: 'utf8', timeout: 60_000 })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-1500)
  return existsSync(out) ? { probe: JSON.parse(readFileSync(out, 'utf8')), output } : { output }
}

const sources = (root: string): string[] => readdirSync(root).flatMap(name => {
  const p = join(root, name)
  return statSync(p).isDirectory() ? sources(p) : /\.(ts|vue|mjs|js)$/.test(name) ? [p] : []
})

afterAll(() => rmSync(probe, { recursive: true, force: true }))

describe('練習 2：小票的取餐時間跟伺服器時區無關', () => {
  it('程式裡沒有設定 process.env.TZ', () => {
    for (const file of [...sources(join(dir, 'api/src')), join(dir, 'vitest.config.ts')]) {
      expect(readFileSync(file, 'utf8'), `${file.slice(dir.length + 1)} 在程式裡改 TZ：這會改掉整個程序的時區（其他功能也跟著變），而且只是把 bug 藏起來。用 Intl.DateTimeFormat 的 timeZone 指定台北`).not.toMatch(/process\.env(\.TZ|\[\s*['"`]TZ['"`]\s*\])\s*=(?!=)|Object\.assign\(\s*process\.env\b/)
    }
  })

  for (const tz of ['UTC', 'America/New_York', 'Asia/Taipei']) {
    it(`伺服器在 ${tz} 時，標籤是台北時間`, { timeout: 70_000 }, () => {
      const { probe, output } = labelsIn(tz)
      expect(probe, `pickup-label.ts 沒辦法執行：\n${output}`).toBeDefined()
      expect([probe!.tz, probe!.zone], `呼叫 pickupLabel 之後，程序的時區從 ${tz} 變成了 ${probe!.zone}：不要改程序的 TZ，用 Intl.DateTimeFormat 的 timeZone 指定台北`).toEqual([tz, tz])
      CASES.forEach(([at, want], i) => {
        const got = probe!.labels[i]
        const hint = got?.replace(/\s/g, ' ') === want ? '（看起來一樣但不相等：Intl 的 format() 在日期和時間之間放的是 U+2009 窄空白，用 formatToParts() 取出月、日、時、分自己組）' : ''
        expect(got, `TZ=${tz} 時 pickupLabel(${at}) 要是 '${want}'，得到 '${got}'${hint}`).toBe(want)
      })
    })
  }
})
