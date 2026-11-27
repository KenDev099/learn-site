// 練習 3：prune.sh 的保留政策。在 Debian 容器裡（GNU date、TZ=Asia/Taipei）執行
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { removeContainers, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-24-prune'
const temps: string[] = []
const prune = (data: string, ...args: string[]) =>
  run('docker', ['run', '--rm', '--name', NAME, '-e', 'TZ=Asia/Taipei', '-v', `${dir}:/w:ro`, '-v', `${data}:/data`, '-w', '/w',
    'debian:trixie-slim', 'bash', 'prune.sh', ...args, '/data'], { timeout: 180_000 })

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (t: Date) => `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`
// ISO 週：週一到週日，週四所在的年份
function isoWeek(day: string) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)))
  d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7)   // 移到同一週的週四
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
  return `${d.getUTCFullYear()}-${Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7)}`
}
// 正確答案：由新到舊，每種規則各自取最近 n 個「有備份的」日／週／月，每一格留最新的一份
function expectedKeep(dumps: string[]) {
  const sorted = [...dumps].sort().reverse()
  const keep = new Set([sorted[0]])
  const rules: [number, (f: string) => string][] = [[7, f => f.slice(5, 13)], [4, f => isoWeek(f.slice(5, 13))], [6, f => f.slice(5, 11)]]
  for (const [n, key] of rules) {
    const seen = new Set<string>()
    for (const f of sorted) if (!seen.has(key(f)) && seen.size < n) { seen.add(key(f)); keep.add(f) }
  }
  return keep
}

// 13 個月的假備份：每天 03:00 UTC，隨機漏幾天；週日、月底與隨機幾天多一份 23:30 UTC（台北時間已經是隔天）
function makeBackups() {
  const data = mkdtempSync(join(dir, '.prune-'))
  temps.push(data)
  const end = Date.UTC(2026, 9, randomInt(20, 32))
  const dumps: string[] = []
  for (let t = end - 400 * 86_400_000; t <= end; t += 86_400_000) {
    const d = new Date(t)
    const tomorrow = new Date(t + 86_400_000)
    if (randomInt(12) > 0 || t === end) dumps.push(`cafe-${stamp(new Date(t + 3 * 3_600_000))}.dump`)
    if (d.getUTCDay() === 0 || tomorrow.getUTCDate() === 1 || randomInt(6) === 0) dumps.push(`cafe-${stamp(new Date(t + 23.5 * 3_600_000))}.dump`)
  }
  for (const f of dumps) {
    const base = f.slice(0, -5)
    writeFileSync(join(data, f), 'dump')
    writeFileSync(join(data, base + '.sha256'), `0000  ${f}\n`)
    writeFileSync(join(data, base + '.manifest.json'), '{}')
  }
  const others = ['LATEST', 'README.txt', 'cafe-20260315.dump', 'cafe-20260315.sha256', 'cafe-manual-before-migration.dump']
  writeFileSync(join(data, 'LATEST'), dumps.sort().at(-1) + '\n')
  for (const f of others.slice(1)) writeFileSync(join(data, f), 'keep me')
  return { data, dumps, others }
}

before(() => { requireDocker(); removeContainers(NAME) })
after(() => { removeContainers(NAME); for (const d of temps) rmSync(d, { recursive: true, force: true }) })

test('--dry-run：一行一個印出要刪的 .dump，而且什麼都不刪', () => {
  const { data, dumps } = makeBackups()
  const before = readdirSync(data).sort()
  const r = prune(data, '--dry-run')
  assert.equal(r.code, 0, `prune.sh --dry-run 失敗（結束碼 ${r.code}）：${r.stderr}`.slice(0, 800))
  assert.deepEqual(readdirSync(data).sort(), before, '--dry-run 只能列出，不能刪任何檔案')
  const keep = expectedKeep(dumps)
  const want = dumps.filter(f => !keep.has(f)).sort()
  const got = r.stdout.split('\n').map(l => l.trim().split('/').at(-1)!).filter(l => l.endsWith('.dump')).sort()
  const extra = got.filter(f => !want.includes(f)), missing = want.filter(f => !got.includes(f))
  assert.ok(!extra.length && !missing.length,
    `要刪的清單不對（總共 ${dumps.length} 份，應該刪 ${want.length} 份、留 ${keep.size} 份）。` +
    (extra.length ? `\n不該刪卻列出：${extra.slice(0, 5).join('、')}` : '') + (missing.length ? `\n該刪卻沒列出：${missing.slice(0, 5).join('、')}` : '') +
    '\n日期一律用檔名裡的 UTC 時間判斷（23:30Z 在台北已經是隔天）；週是 ISO 週（週一到週日，date -u +%G-%V）')
})

test('實際執行：留下該留的，.sha256 與 .manifest.json 跟著主檔刪；LATEST 和格式不符的檔案不能動', () => {
  const { data, dumps, others } = makeBackups()
  const r = prune(data)
  assert.equal(r.code, 0, `prune.sh 失敗（結束碼 ${r.code}）：${r.stderr}`.slice(0, 800))
  for (const f of others) assert.ok(existsSync(join(data, f)), `${f} 被刪了：只處理檔名完全符合 cafe-YYYYMMDDTHHMMSSZ.dump 的備份，其他檔案一律不碰`)
  const keep = expectedKeep(dumps)
  const left = readdirSync(data).filter(f => /^cafe-\d{8}T\d{6}Z\.dump$/.test(f)).sort()
  assert.deepEqual(left, [...keep].sort(), `留下的備份不對：應該留 ${keep.size} 份，現在留 ${left.length} 份`)
  assert.ok(left.includes(dumps.sort().at(-1)!), '最新的一份一定要留')
  for (const f of dumps) {
    const base = f.slice(0, -5)
    for (const side of [base + '.sha256', base + '.manifest.json'])
      assert.equal(existsSync(join(data, side)), keep.has(f), keep.has(f) ? `${side} 被刪了，但 ${f} 還留著` : `${f} 刪了，${side} 卻還在（孤兒檔）`)
  }
})
