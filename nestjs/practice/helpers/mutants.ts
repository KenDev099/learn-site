// 檢查學習者寫的測試抓不抓得到 bug（第 5、10、17、26、27 課的「寫測試」練習）
//   const r = runMutants(import.meta.dirname, {
//     '少算加價': { 'src/pricing.ts': code => code.replace('+ 10', '') },   // 函式：改原始碼；字串：整個檔案換掉
//   })
//   expect(r.survived, '這些故意改壞的版本，你的測試都沒有抓到').toEqual([])
// 做法：把 task 資料夾複製到 practice/.mut/<隨機>/（跟 work/<題號>/ 一樣深，tsconfig 的 ../../ 才對得上），
// 用 task 自己的 vitest.config.ts 跑學習者的 *.spec.ts。原本的程式要「至少一個測試、全部通過、沒有 skip／todo」，
// 否則丟出錯誤；每個 mutant 至少要有一個測試失敗才算抓到。每個測試至少要有一個 expect（expect.requireAssertions）
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join } from 'node:path'

type Mutant = Record<string, string | ((code: string) => string)>
type Summary = { total: number; passed: number; failed: number; skipped: number; output: string }

const practice = join(import.meta.dirname, '..')
const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-1500)

function runSpecs(taskDir: string, mutant: Mutant = {}): Summary {
  mkdirSync(join(practice, '.mut'), { recursive: true })
  const dir = mkdtempSync(join(practice, '.mut', `${basename(taskDir)}-`))
  try {
    cpSync(taskDir, dir, { recursive: true, filter: f => !/(^|\/)(node_modules|dist)$|\.test\.ts$/.test(f) })
    for (const [file, change] of Object.entries(mutant)) {
      const path = join(dir, file)
      writeFileSync(path, typeof change === 'string' ? change : change(readFileSync(path, 'utf8')))
    }
    const out = join(dir, '.result.json')
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
    const r = spawnSync(process.execPath, [join(practice, 'node_modules', 'vitest', 'vitest.mjs'), 'run',
      '--root', dir, '--config', join(dir, 'vitest.config.ts'), '--expect.requireAssertions', '--allowOnly=false',
      '--reporter=default', '--reporter=json', `--outputFile.json=${out}`], { cwd: dir, env, encoding: 'utf8', timeout: 120_000 })
    let json: any = {}
    try { json = JSON.parse(readFileSync(out, 'utf8')) } catch {}
    return {
      total: json.numTotalTests ?? 0,
      passed: json.numPassedTests ?? 0,
      failed: (json.numFailedTests ?? 0) + (json.numFailedTestSuites ?? 0) + (r.status !== 0 && !json.numFailedTests ? 1 : 0),
      skipped: (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0),
      output: clean(r.stdout + r.stderr),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    try { rmdirSync(join(practice, '.mut')) } catch {}   // 空了才刪：別的題目可能同時在用
  }
}

export function runMutants(taskDir: string, mutants: Record<string, Mutant>) {
  const original = runSpecs(taskDir)
  if (!original.total) throw new Error(`沒有找到你寫的測試（src/**/*.spec.ts、test/**/*.e2e-spec.ts）：\n${original.output}`)
  if (original.skipped) throw new Error('你的測試裡有 skip 或 todo：每個測試都要真的執行')
  if (original.failed) throw new Error(`你的測試在原本（正確）的程式上就沒通過：\n${original.output}`)
  const survived: string[] = [], killed: string[] = []
  for (const [name, mutant] of Object.entries(mutants)) (runSpecs(taskDir, mutant).failed ? killed : survived).push(name)
  return { original, survived, killed }
}
