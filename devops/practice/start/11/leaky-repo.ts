// 練習 3、4 用的 git repo：每次產生新的假金鑰，放在隨機的檔案和 commit，之後再「刪掉」
// leaky=null 時只刪除資料夾
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { run } from '../../helpers/docker.ts'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const pick = <T>(a: T[]) => a[randomInt(a.length)]

export function makeRepo(repo: string, leaky: boolean | null) {
  rmSync(repo, { recursive: true, force: true })
  if (leaky === null) return { sha: '', removed: '', file: '', key: '' }
  mkdirSync(repo, { recursive: true })
  let n = 0
  const git = (...a: string[]) => {
    const date = `2026-03-0${1 + Math.floor(n / 10)}T0${n % 10}:00:00Z`
    const r = run('git', ['-c', 'user.name=Cafe Dev', '-c', 'user.email=dev@cafe.test', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-C', repo, ...a],
      // GIT_DIR 固定在這個資料夾裡：絕不會動到外層的 repo
      { env: { GIT_DIR: join(repo, '.git'), GIT_WORK_TREE: repo, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
    if (r.code !== 0) throw new Error(`git ${a.join(' ')} 失敗：${r.stderr}`)
    return r.stdout
  }
  const commit = (file: string, text: string, msg: string) => {
    mkdirSync(dirname(join(repo, file)), { recursive: true })
    writeFileSync(join(repo, file), text)
    git('add', '-A'); git('commit', '-q', '-m', msg); n++
    return git('rev-parse', 'HEAD')
  }
  // 假的 AWS access key：符合 gitleaks 的 aws-access-token 規則，但不是真的金鑰
  const key = 'AKIA' + Array.from(randomBytes(16), b => B32[b % 32]).join('')
  const file = pick(['src/storage.ts', 'scripts/upload-menu.sh', 'config/aws.json', 'src/receipts/s3.ts'])
  const filler = (i: number) => commit(`docs/notes-${i}.md`, `# 第 ${i} 次會議紀錄\n- 菜單價格：拿鐵 110\n`, `docs: 第 ${i} 次會議紀錄`)
  git('init', '-q')
  commit('README.md', '# cafe-api\n', 'chore: 初始化專案')
  for (let i = randomInt(1, 4); i > 0; i--) filler(n)
  let sha = '', removed = ''
  if (leaky) {
    sha = commit(file, `// 上傳收據到 S3\nconst accessKeyId = '${key}'\nconst region = 'ap-northeast-1'\n`, 'feat: 收據上傳到 S3')
    for (let i = randomInt(1, 4); i > 0; i--) filler(n)
    removed = commit(file, `// 上傳收據到 S3（金鑰改由環境提供）\nconst region = 'ap-northeast-1'\n`, 'fix: 移除寫死的金鑰')
  }
  for (let i = randomInt(1, 3); i > 0; i--) filler(n)
  return { sha, removed, file, key }
}
