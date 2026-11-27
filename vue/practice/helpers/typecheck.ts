// 用 vue-tsc 做型別檢查：把 files（檔名 → 內容）寫進 dir，只檢查它們和它們 import 到的檔案，回傳錯誤訊息（沒有錯誤就是 ''）
// 暫存檔一定會刪掉；檔名請帶題號（__ex1.usage.ts），平行執行的測試才不會互撞。一次大約 1.5 秒，測試請給 30 秒 timeout
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

export function typecheck(dir: string, files: Record<string, string>): string {
  const names = Object.keys(files)
  const config = join(dir, `__tsconfig.${names[0].replace(/[^\w-]/g, '_')}.json`)
  const temp = [config, ...names.map(n => join(dir, n))]
  try {
    for (const n of names) writeFileSync(join(dir, n), files[n])
    // 只設 files 時仍會繼承上層的 include，所以要明寫 include: []，不然會檢查整個 work/
    writeFileSync(config, JSON.stringify({ extends: relative(dir, join(ROOT, 'tsconfig.json')), files: names, include: [] }))
    execFileSync(join(ROOT, 'node_modules/.bin/vue-tsc'), ['--noEmit', '-p', config], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
    return ''
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string }
    return (err.stdout || err.stderr || err.message).trim()
  } finally {
    for (const f of temp) rmSync(f, { force: true })
  }
}
