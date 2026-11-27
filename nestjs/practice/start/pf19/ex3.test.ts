// 練習 3：公開前檢查：git 歷史裡沒有 secret
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })

// 常見的 secret 樣式：AWS access key、私鑰、Stripe 正式金鑰、GitHub token、Slack token
const PATTERNS: [string, RegExp][] = [
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['私鑰', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Stripe 正式金鑰', /\b[sr]k_live_[0-9a-zA-Z]{10,}/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{36}\b/],
  ['Slack token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
]

// 學習者：掃 git 的所有歷史（刪掉的檔案、別的分支也算）；出題檢查的資料夾不是 git repo，改掃工作目錄（.env 照 .gitignore 略過）
function sources(): [string, string][] {
  if (t.verify) {
    const out: [string, string][] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        if (['node_modules', 'dist', 'generated', '.env'].includes(f)) continue
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (statSync(p).size < 1_000_000) out.push([relative(t.repo, p), readFileSync(p, 'utf8')])
      }
    }
    walk(t.repo)
    return out
  }
  const inRepo = spawnSync('git', ['-C', t.repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (inRepo.status !== 0) throw new Error(`${t.repo} 不是 git repo：作品要放在 git repo 裡`)
  const log = spawnSync('git', ['-C', t.repo, 'log', '-p', '--all', '--no-color'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (log.status !== 0) throw new Error(`git log 失敗：${log.stderr.slice(0, 300)}`)
  return [['git 歷史', log.stdout]]
}

describe('練習 3：公開前檢查', () => {
  it('git 歷史（含刪掉的檔案）裡沒有常見的 secret 樣式', () => {
    const hits: string[] = []
    for (const [where, text] of sources()) {
      for (const [name, re] of PATTERNS) {
        const m = text.match(re)
        if (m) hits.push(`${where}：${name}（${m[0].slice(0, 8)}…）`)
      }
    }
    expect(hits, `找到 secret：${hits.join('；')}。先到那個服務撤銷、換一把新的（歷史裡的已經外洩），再用 git filter-repo 從歷史移除；只在新的 commit 刪掉沒有用`).toEqual([])
  })
})
