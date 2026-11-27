// 練習 3：CI 與 GitOps 分工：CI 建置映像、改 config repo 的 image.tag 並開 PR；不碰叢集
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseYaml, readText, run } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex3')
const FILE = '.github/workflows/release.yml'
const ACTIONLINT = 'rhysd/actionlint:1.7.12'
// 這一課用的版本（和 devops 課第 15、16 課相同）
const KNOWN: Record<string, Record<string, string>> = {
  'actions/checkout': { '3d3c42e5aac5ba805825da76410c181273ba90b1': 'v7.0.1' },
  'docker/setup-buildx-action': { f87e5991a6d7451dcb8d9637bfbc97413f497069: 'v4.4.1' },
  'docker/login-action': { '81c6f93d4bc991e510b342a00b419b3bb4efc5c6': 'v4.7.0' },
  'docker/build-push-action': { c3c9e263c25d99ce0380d002d59b67737d91b0dc: 'v7.4.0' },
}
const SHA = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00'
const VALUES = `# prod 的設定；image.tag 由 cafe-api 的 release workflow 開 PR 更新
image:
  repository: ghcr.io/example-cafe/cafe-api
  tag: 1111111111111111111111111111111111111111
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 6
host: api.cafe.test
`

type Step = { uses?: string, run?: string, with?: Record<string, any>, env?: Record<string, any>, 'working-directory'?: string }
const wf = () => {
  const [w] = parseYaml(readText(dir, FILE), FILE)
  assert(w?.jobs && typeof w.jobs === 'object', `${FILE} 裡沒有 jobs:`)
  return w
}
const jobs = (w: any): [string, any][] => Object.entries(w.jobs)
const steps = (job: any): Step[] => Array.isArray(job?.steps) ? job.steps : []
const allSteps = (w: any) => jobs(w).flatMap(([, j]) => steps(j))
const expr = (s: string) => s.replace(/\$\{\{\s*github\.sha\s*\}\}/g, SHA)

test('actionlint 沒有錯誤', { timeout: 240_000 }, () => {
  const r = run('docker', ['run', '--rm', '-v', `${dir}:/repo`, '-w', '/repo', ACTIONLINT, '-no-color', FILE], { timeout: 220_000 })
  assert(!/Cannot connect to the Docker daemon|command not found|ENOENT/.test(r.stderr), `跑不了 actionlint：先打開 Docker Desktop。\n${r.stderr}`)
  assert.equal(r.code, 0, `actionlint 回報問題：\n${(r.stdout + r.stderr).trim()}`)
})

test('CI 不碰叢集：沒有 kubectl、helm upgrade、kubeconfig、AWS 部署角色', { timeout: 10_000 }, () => {
  const w = wf()
  for (const [id, job] of jobs(w)) {
    const text = JSON.stringify(job)   // 解析後的內容：寫在註解裡的不算
    const bad = /\bkubectl\b|\bhelm\s+(upgrade|install)\b|KUBECONFIG|update-kubeconfig|configure-aws-credentials|\bargocd\s+app\s+sync\b/i.exec(text)
    assert(!bad, `job ${id} 有「${bad?.[0]}」：GitOps 下 CI 不持有叢集憑證，也不直接改叢集。CI 只把新 tag 寫進 config repo 開 PR，合併後由叢集裡的 Argo CD 自己同步`)
  }
})

test('每個 uses 都釘 40 字元 commit SHA；權限最小', { timeout: 10_000 }, () => {
  const w = wf()
  for (const s of allSteps(w)) {
    if (!s.uses) continue
    const m = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(s.uses)
    assert(m, `uses: ${s.uses} 沒有釘到完整的 commit SHA：tag（例如 @v7）可以被改指向別的 commit，要寫 owner/repo@<40 字元 SHA> # v7.0.1`)
    const known = KNOWN[m[1]]
    if (known) assert(known[m[2]], `${m[1]}@${m[2]} 不是這課用的版本（${Object.entries(known).map(([sha, v]) => `${v} = ${sha}`).join('、')}）`)
  }
  assert.deepEqual(w.permissions, { contents: 'read' }, '最上層 permissions 只要 contents: read；需要更多的 job 自己加')
  for (const [id, job] of jobs(w)) {
    const p = job.permissions ?? {}
    assert(p !== 'write-all', `job ${id} 用了 write-all`)
    const writes = Object.entries(p).filter(([, v]) => v === 'write').map(([k]) => k)
    const allowed = steps(job).some(s => s.uses?.startsWith('docker/build-push-action@')) ? ['packages'] : []
    const extra = writes.filter(k => !allowed.includes(k))
    assert.deepEqual(extra, [], `job ${id} 有多餘的寫入權限：${extra.join('、')}。只有推映像的 job 需要 packages: write；改 config repo 用的是另一把 token，不是這個 repo 的 GITHUB_TOKEN`)
  }
})

test('build：映像 tag 用這次的 commit SHA', { timeout: 10_000 }, () => {
  const push = allSteps(wf()).find(s => s.uses?.startsWith('docker/build-push-action@'))
  assert(push, '要有一個 docker/build-push-action 的步驟建置並推送映像')
  const tags = String(push.with?.tags ?? '')
  assert.equal(push.with?.push, true, 'build-push-action 要 push: true')
  assert(/\$\{\{\s*github\.sha\s*\}\}/.test(tags), `build-push-action 的 tags 要用 \${{ github.sha }}，現在是 ${tags}：每個版本一個不會變的 tag，config repo 才能指名要哪一版`)
  assert(!/:latest\b/.test(tags), 'tags 不要用 latest：它會一直被覆蓋，看不出 prod 跑的是哪一版')
})

test('bump-config：在 build 之後，用專屬 token checkout config repo，最後開 PR', { timeout: 10_000 }, () => {
  const w = wf()
  const entry = jobs(w).find(([, j]) => steps(j).some(s => s.uses?.startsWith('actions/checkout@') && s.with?.repository === 'example-cafe/cafe-config'))
  assert(entry, '要有一個 job 用 actions/checkout 的 with.repository: example-cafe/cafe-config 取出 config repo')
  const [id, job] = entry
  const buildId = jobs(w).find(([, j]) => steps(j).some(s => s.uses?.startsWith('docker/build-push-action@')))?.[0]
  assert(buildId && [job.needs].flat().includes(buildId), `job ${id} 要 needs: ${buildId}：映像推上去之後才能讓 prod 指到它`)
  const co = steps(job).find(s => s.with?.repository === 'example-cafe/cafe-config')!
  const token = String(co.with?.token ?? '')
  assert(/\$\{\{\s*secrets\.\w+\s*\}\}/.test(token) && !/GITHUB_TOKEN/.test(token),
    `checkout config repo 要給 token: \${{ secrets.<名稱> }}（例如 CONFIG_REPO_TOKEN），現在是「${token}」：這個 repo 的 GITHUB_TOKEN 不能推到別的 repo`)
  const script = steps(job).map(s => s.run ?? '').join('\n')
  assert(/\bgh\s+pr\s+create\b/.test(script), `job ${id} 最後要用 gh pr create 開 PR：prod 的變更要經過 review 與紀錄`)
  assert(!/git\s+push\b[^\n]*\b(main|master)\b/.test(script), '不要直接 push 到 config repo 的 main：推到新的分支再開 PR')
})

test('yq 指令只把 values-prod.yaml 的 image.tag 改成這次的 SHA', { timeout: 30_000 }, () => {
  const w = wf()
  const job = jobs(w).map(([, j]) => j).find(j => steps(j).some(s => s.with?.repository === 'example-cafe/cafe-config'))
  assert(job, '找不到 checkout config repo 的 job（見上一個測試）')
  const co = steps(job).find(s => s.with?.repository === 'example-cafe/cafe-config')!
  const yqSteps = steps(job).filter(s => /\byq\b/.test(s.run ?? ''))
  assert(yqSteps.length, '要有一個 run 步驟用 yq 修改 values-prod.yaml')
  const tmp = mkdtempSync(join(tmpdir(), 'learn-k8s-15-'))
  try {
    const file = join(tmp, co.with?.path ?? '', 'charts/cafe/values-prod.yaml')
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, VALUES)
    for (const s of yqSteps) {
      const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }
      for (const [k, v] of Object.entries(s.env ?? {})) env[k] = expr(String(v))
      for (const line of (s.run ?? '').split('\n').filter(l => /^\s*yq\b/.test(l))) {
        const r = run('bash', ['-c', expr(line)], { cwd: join(tmp, s['working-directory'] ?? ''), env })
        assert(r.code !== 127, '找不到 yq：執行 brew install yq')
        assert.equal(r.code, 0, `「${line.trim()}」執行失敗（在 checkout 的資料夾外層執行，路徑要包含 checkout 的 path）：\n${r.stderr}`)
      }
    }
    const after = readFileSync(file, 'utf8')
    const [v] = parseYaml(after, 'values-prod.yaml')
    assert.equal(String(v?.image?.tag), SHA, `image.tag 要變成這次的 commit SHA（測試用 ${SHA} 代替 github.sha），現在是 ${v?.image?.tag}。用 env 傳 TAG: \${{ github.sha }}，yq 裡用 strenv(TAG)`)
    const before = VALUES.split('\n'), now = after.split('\n')
    const changed = now.filter((l, i) => l !== before[i])
    assert(now.length === before.length && changed.length === 1, `values-prod.yaml 除了 image.tag 那一行，其他（含註解與排版）都不能變；改變的行：\n${changed.join('\n')}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
