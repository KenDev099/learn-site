// 練習 3：取餐號碼的測試不管用什麼順序跑都通過；不靠 retry、不跳過測試
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const SPEC = 'api/src/orders/order-number.spec.ts'
const VITEST = join(dir, '../../node_modules/vitest/vitest.mjs')
const mutant = `${dir}-mutant`
const read = (file: string) => existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : ''
const noComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

type Result = { success: boolean, numPassedTests: number, numFailedTests: number, numPendingTests: number, numTodoTests: number, testResults: { message: string, assertionResults: { title: string, status: string }[] }[] }
function runSpec(root: string, args: string[]): { result?: Result, output: string } {
  const out = join(root, '.order-number-result.json')
  rmSync(out, { force: true })
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
  const r = spawnSync(process.execPath, [VITEST, 'run', '--reporter=json', `--outputFile=${out}`, '--retry=0', ...args, SPEC], { cwd: root, env, encoding: 'utf8', timeout: 60_000 })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-1500)
  if (!existsSync(out)) return { output }
  const result = JSON.parse(readFileSync(out, 'utf8')) as Result
  rmSync(out, { force: true })
  return { result, output }
}
const failed = (r: Result) => r.testResults.flatMap(f => f.assertionResults.filter(a => a.status === 'failed').map(a => a.title))

afterAll(() => rmSync(mutant, { recursive: true, force: true }))

describe('練習 3：取餐號碼的測試不再時好時壞', () => {
  it('vitest 設定裡沒有 retry', () => {
    expect(noComments(read('vitest.config.ts')), 'vitest.config.ts 還有 retry：它讓時好時壞的測試「重試到過」，CI 就看不到問題了。修好根因之後把它拿掉').not.toMatch(/\bretry\b/)
  })

  it('測試沒有被跳過，數量不少於原本的 4 個', () => {
    const spec = noComments(read(SPEC))
    expect(spec, `找不到 ${SPEC}`).not.toBe('')
    expect(spec, '不要用 skip、todo、only 或 skipIf 讓測試不跑').not.toMatch(/\.(skip|todo|only|skipIf|runIf)\b/)
    expect((spec.match(/\b(it|test)\s*\(/g) ?? []).length, '原本的 4 個測試都要留著（可以改寫，不要刪）').toBeGreaterThanOrEqual(4)
  })

  it('createOrderNumbers() 每次建立的是一組獨立的號碼', async () => {
    const mod = await import('./api/src/orders/order-number.ts') as Record<string, unknown>
    expect(typeof mod.createOrderNumbers, 'order-number.ts 要 export createOrderNumbers()，回傳 { next(), reset() }').toBe('function')
    const create = mod.createOrderNumbers as () => { next(): string, reset(): void }
    const a = create()
    const b = create()
    expect([a.next(), a.next()], '第一組：A001、A002').toEqual(['A001', 'A002'])
    expect(b.next(), '另一組不受第一組影響，從 A001 開始').toBe('A001')
    for (let i = 0; i < 997; i++) a.next()
    expect(a.next(), 'A999 之後回到 A001').toBe('A001')
    a.reset()
    expect(a.next(), 'reset() 之後從 A001 開始').toBe('A001')
  })

  it('用 10 種不同的隨機順序跑你的 spec，每一次都全部通過', { timeout: 120_000 }, () => {
    for (const seed of [1, 7, 42, 99, 123, 777, 1873, 2026, 31337, 65535]) {
      const { result, output } = runSpec(dir, ['--sequence.shuffle', `--sequence.seed=${seed}`])
      expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
      expect(failed(result!), `seed ${seed} 時這些測試沒過（npm test -- --sequence.shuffle --sequence.seed=${seed} 可以重現）：還有測試依賴別的測試留下的狀態`).toEqual([])
      expect(result!.numPassedTests, `seed ${seed}：要有至少 4 個真的通過的測試\n${result!.testResults.map(f => f.message).join(' ')}`).toBeGreaterThanOrEqual(4)
      expect(result!.numPendingTests + result!.numTodoTests, '不能有被跳過的測試').toBe(0)
    }
  })

  it('spec 抓得到壞掉的號碼產生器（沒補零、沒有回到 A001、reset 沒作用）', { timeout: 90_000 }, () => {
    const ok = 'last = last % 999 + 1\n      return `A${String(last).padStart(3, \'0\')}`'
    const mutants: Record<string, [string, string]> = {
      '沒有補零（A1）': ['last = last + 1\n      return `A${last}`', 'last = 0'],
      '超過 999 沒有回到 A001（A1000）': ['last = last + 1\n      return `A${String(last).padStart(3, \'0\')}`', 'last = 0'],
      'reset() 沒有歸零': [ok, ''],
    }
    for (const [name, [body, reset]] of Object.entries(mutants)) {
      rmSync(mutant, { recursive: true, force: true })
      mkdirSync(join(mutant, 'api/src/orders'), { recursive: true })
      cpSync(join(dir, SPEC), join(mutant, SPEC))
      writeFileSync(join(mutant, 'vitest.config.ts'), 'export default {}\n')
      writeFileSync(join(mutant, 'api/src/orders/order-number.ts'), `export function createOrderNumbers() {
  let last = 0
  return {
    next(): string {
      ${body}
    },
    reset(): void {
      ${reset}
    },
  }
}
`)
      const { result, output } = runSpec(mutant, [])
      expect(result, `spec 沒有跑起來：\n${output}`).toBeDefined()
      expect(failed(result!).length > 0, `號碼產生器${name}時，你的 spec 全部通過了：測試要斷言實際的號碼（第一張 A001、A999 之後是 A001、reset() 之後是 A001）`).toBe(true)
    }
  })
})
