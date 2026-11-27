// 第 15 課三個測試檔共用：讀 workflow、跑 actionlint、檢查 uses 與 npm 指令
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { run } from '../../helpers/docker.ts'

export const ACTIONLINT = 'rhysd/actionlint:1.7.12'
// 這一課用的版本（2026-10-31 查過 GitHub 上 tag 指向的 commit）
export const KNOWN: Record<string, Record<string, string>> = {
  'actions/checkout': { '3d3c42e5aac5ba805825da76410c181273ba90b1': 'v7.0.1' },
  'actions/setup-node': { '949feb2413d6458794dcd2491c4babbbce0c15c1': 'v7.1.0' },
}

export type Step = { uses?: string, run?: string, with?: Record<string, any>, env?: Record<string, any>, name?: string }
export type Job = { needs?: string | string[], steps?: Step[], services?: Record<string, any>, env?: Record<string, any>,
  strategy?: { matrix?: Record<string, any> }, 'timeout-minutes'?: number, permissions?: any, 'runs-on'?: any }

// 讀 .github/workflows/<file>，回傳解析後的物件；檔案不存在或 YAML 寫錯時丟出說明
export function loadWorkflow(dir: string, file: string): any {
  const path = join(dir, '.github', 'workflows', file)
  let text: string
  try { text = readFileSync(path, 'utf8') } catch { throw new Error(`找不到 .github/workflows/${file}`) }
  let wf: any
  try { wf = parse(text) } catch (e) { throw new Error(`.github/workflows/${file} 不是合法的 YAML：${(e as Error).message.split('\n')[0]}`) }
  assert.ok(wf && typeof wf === 'object' && wf.jobs && typeof wf.jobs === 'object', `.github/workflows/${file} 裡沒有 jobs:`)
  return wf
}

// 用 Docker 跑 actionlint（內含 shellcheck），回傳結束碼與訊息
export function actionlint(dir: string, file: string) {
  const r = run('docker', ['run', '--rm', '-v', `${dir}:/repo`, '-w', '/repo', ACTIONLINT, '-no-color', `.github/workflows/${file}`], { timeout: 180_000 })
  return { code: r.code, out: (r.stdout + '\n' + r.stderr).trim() }
}

export const jobsOf = (wf: any): [string, Job][] => Object.entries(wf.jobs ?? {}) as [string, Job][]
export const stepsOf = (job: Job | undefined): Step[] => Array.isArray(job?.steps) ? job.steps : []
export const runsOf = (job: Job | undefined) => stepsOf(job).filter(s => typeof s.run === 'string').map(s => s.run as string)
export const needsOf = (job: Job | undefined) => job?.needs === undefined ? [] : [job.needs].flat()
export const usesStep = (job: Job | undefined, action: string) => stepsOf(job).find(s => s.uses?.split('@')[0] === action)
// 「on:」在 YAML 1.1 會被當成 true，yaml 套件預設是 1.2，所以 key 就是 'on'
export const triggers = (wf: any): Record<string, any> => typeof wf.on === 'string' ? { [wf.on]: null } : Array.isArray(wf.on) ? Object.fromEntries(wf.on.map((e: string) => [e, null])) : (wf.on ?? {})

// 每個 uses 都要是 owner/repo@40 個十六進位字元；checkout、setup-node 要是這課查過的 commit
export function checkPinned(wf: any) {
  for (const [id, job] of jobsOf(wf)) for (const s of stepsOf(job)) {
    if (!s.uses) continue
    const m = /^([\w.-]+\/[\w.-]+)(\/[\w./-]+)?@([0-9a-f]{40})$/.exec(s.uses)
    assert.ok(m, `job ${id} 的 uses: ${s.uses} 沒有釘到完整的 commit SHA：tag（例如 @v7）可以被改指向別的 commit，要寫 owner/repo@<40 字元 SHA> # v7.0.1`)
    const known = KNOWN[m[1]]
    if (known) assert.ok(known[m[3]], `job ${id} 的 ${m[1]}@${m[3]} 不是這課用的版本（${Object.entries(known).map(([sha, v]) => `${v} = ${sha}`).join('、')}）：SHA 要從 action 自己的 repo 查，不要從 fork 或文章裡複製`)
  }
}

// npm 一律用 npm ci；npm run 的腳本都要存在於 package.json
export function checkNpm(wf: any, dir: string) {
  const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {}
  for (const [id, job] of jobsOf(wf)) {
    let installed = false
    for (const r of runsOf(job)) {
      assert.doesNotMatch(r, /\bnpm\s+(install|i|add)\b/, `job ${id} 用了 npm install：CI 要用 npm ci，完全照 package-lock.json 安裝，lockfile 跟 package.json 對不上時直接失敗`)
      const ci = r.search(/\bnpm\s+ci\b/), use = r.search(/\bnpm\s+(run|test)\b/)
      if (use >= 0 && !installed && (ci < 0 || ci > use))
        assert.fail(`job ${id} 在 npm ci 之前就執行 npm 腳本：每個 job 都是一台全新的機器，job 之間不共用 node_modules，每個 job 都要先 npm ci`)
      if (ci >= 0) installed = true
      for (const [, name] of r.matchAll(/\bnpm\s+run(?:-script)?\s+([\w:.-]+)/g))
        assert.ok(name in scripts, `job ${id} 執行 npm run ${name}，但 package.json 沒有這個腳本（有的是：${Object.keys(scripts).join('、')}）`)
    }
  }
}

// 檢查失敗時 workflow 也要失敗：不能用 continue-on-error 或 || true 把紅燈蓋掉
export function checkNoBypass(wf: any) {
  for (const [id, job] of jobsOf(wf)) {
    assert.ok(!(job as any)['continue-on-error'], `job ${id} 寫了 continue-on-error：job 失敗時 workflow 照樣是綠的，必要檢查就擋不住壞掉的 PR。拿掉它`)
    for (const s of stepsOf(job)) {
      assert.ok(!(s as any)['continue-on-error'], `job ${id} 的步驟 ${s.run ?? s.uses} 寫了 continue-on-error：這一步失敗時 job 仍然算通過。拿掉它`)
      assert.doesNotMatch(String(s.run ?? ''), /\|\|\s*(true|:|exit 0)\b/, `job ${id} 的 ${s.run} 用 || true 吞掉了失敗：指令失敗時這一步仍然算通過。拿掉 || true`)
    }
  }
}

// 建置映像但不推送：docker push、docker image push、buildx --push、build-push-action 的 push: true 都算推送
export const pushes = (job: Job | undefined) =>
  runsOf(job).some(r => /\bdocker\s+(image\s+)?push\b|--push\b|--output[= ][^\n]*type=registry/.test(r)) || stepsOf(job).some(s => s.with?.push === true || s.with?.push === 'true')

// setup-node 要開 npm 快取；不要自己快取 node_modules
export function checkCache(wf: any) {
  for (const [id, job] of jobsOf(wf)) {
    const node = usesStep(job, 'actions/setup-node')
    if (node) assert.equal(node.with?.cache, 'npm', `job ${id} 的 setup-node 沒有 cache: npm：每次都要重新下載所有套件`)
    const cache = usesStep(job, 'actions/cache')
    assert.ok(!cache || !/node_modules/.test(String(cache.with?.path ?? '')), `job ${id} 用 actions/cache 快取 node_modules：裡面有依作業系統與 Node 版本編譯的檔案，換 runner 或 Node 版本就壞，npm ci 也會先把它刪掉。改用 setup-node 的 cache: npm（快取的是 ~/.npm）`)
  }
}

// postgres service 的 options 要有健康檢查，runner 才會等資料庫可以連線再開始跑 steps
export function healthOptions(service: any): string[] {
  const opts = String(service?.options ?? '')
  return opts.match(/"[^"]*"|'[^']*'|\S+/g)?.map(s => s.replace(/^(["'])(.*)\1$/, '$2')) ?? []
}
