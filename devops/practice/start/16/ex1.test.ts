import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import { requireDocker, run, removeContainers, inspect, readJson } from '../../helpers/docker.ts'
import { gitEnv, startRegistry, registryDigest, registryTags } from './lib.ts'

const dir = import.meta.dirname
const repo = join(dir, 'ex1-repo')
const git = (...a: string[]) => {
  const r = run('git', ['-C', repo, ...a], { env: gitEnv(dir) })
  if (r.code !== 0) throw new Error(`產生練習 repo 失敗：git ${a.join(' ')}：${r.stderr}`)
  return r.stdout
}
const release = () => run('sh', ['release.sh', 'ex1-repo'], { cwd: dir, env: gitEnv(dir), timeout: 600_000 })
const why = (r: { stdout: string, stderr: string }) => (r.stderr || r.stdout).slice(-800)
let sha = '', short = '', version = ''

before(async () => {
  requireDocker()
  await startRegistry()
  // 每次重新產生 app 的 repo：版本號和內容都是隨機的，commit 也就每次不同
  rmSync(repo, { recursive: true, force: true })
  cpSync(join(dir, 'app'), repo, { recursive: true })
  version = `1.${randomInt(5, 50)}.${randomInt(0, 20)}`
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ ...pkg, version }, null, 2) + '\n')
  writeFileSync(join(repo, 'CHANGELOG.md'), `# ${version}\n- 拿鐵改用燕麥奶（${randomBytes(4).toString('hex')}）\n`)
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Cafe Dev'); git('config', 'user.email', 'dev@cafe.test'); git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', `release ${version}`)
  sha = git('rev-parse', 'HEAD')
  short = sha.slice(0, 7)
  rmSync(join(dir, 'release.json'), { force: true })
})
after(() => removeContainers('ld-16-registry'))

test('release.sh 建置一次，短 SHA 與版本兩個 tag 在 registry 上指向同一個 digest，release.json 記下它', async () => {
  const r = release()
  assert.equal(r.code, 0, `sh release.sh ex1-repo 失敗（結束碼 ${r.code}）：\n${why(r)}`)
  const tags = await registryTags('cafe-api')
  assert.ok(tags.includes(short), `registry 上沒有 cafe-api:${short}（7 碼短 SHA）。現在的 tag：${tags.join(', ') || '（沒有）'}`)
  assert.ok(tags.includes(version), `registry 上沒有 cafe-api:${version}（package.json 的 version）。現在的 tag：${tags.join(', ')}`)
  const a = await registryDigest('cafe-api', short), b = await registryDigest('cafe-api', version)
  assert.equal(a, b, `:${short} 是 ${a}，:${version} 是 ${b}：兩個 tag 要是同一次建置的同一個映像（一次 docker build 打兩個 -t）`)

  const rel = readJson(dir, 'release.json')
  assert.equal(rel.sha, sha, 'release.json 的 sha 要是完整的 commit SHA（git rev-parse HEAD）')
  assert.equal(rel.version, version, 'release.json 的 version 要是 package.json 的 version')
  assert.equal(rel.digest, a, `release.json 的 digest 要是 registry 上的 digest ${a}（不是本機的 image ID）`)

  const img = inspect(`localhost:18160/cafe-api:${short}`, 'image')
  assert.ok(img, `本機找不到 localhost:18160/cafe-api:${short}`)
  const labels = img.Config?.Labels ?? {}
  assert.equal(labels['org.opencontainers.image.revision'], sha, 'label org.opencontainers.image.revision 要是完整的 commit SHA')
  assert.equal(labels['org.opencontainers.image.version'], version, 'label org.opencontainers.image.version 要是 package.json 的 version')
  assert.match(labels['org.opencontainers.image.created'] ?? '', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, `label org.opencontainers.image.created 要是帶時區的 RFC 3339 時間（例如 2026-11-01T08:30:00Z，用 date -u +%Y-%m-%dT%H:%M:%SZ），現在是 ${labels['org.opencontainers.image.created']}`)
  const created = Date.parse(labels['org.opencontainers.image.created'] ?? '')
  assert.ok(Math.abs(Date.now() - created) < 15 * 60_000, `label org.opencontainers.image.created 要是建置時間（ISO 8601，例如 2026-11-01T08:30:00Z），現在是 ${labels['org.opencontainers.image.created']}`)
  assert.ok(!tags.includes('latest'), '不要推 latest：部署和回滾都要指名一個不會變的版本')
})

test('工作目錄有未提交的改動或沒追蹤的檔案時，release.sh 拒絕發佈，registry 不變', async () => {
  const before = Object.fromEntries(await Promise.all((await registryTags('cafe-api')).map(async t => [t, await registryDigest('cafe-api', t)])))
  appendFileSync(join(repo, 'server.mjs'), '\n// 還在試的改動，沒有 commit\n')
  const r1 = release()
  git('checkout', '--', 'server.mjs')
  writeFileSync(join(repo, 'debug-notes.txt'), '忘了刪的檔案\n')
  const r2 = release()
  rmSync(join(repo, 'debug-notes.txt'))
  assert.notEqual(r1.code, 0, '改了 server.mjs 沒有 commit，release.sh 還是發佈了：先用 git status --porcelain 檢查')
  assert.notEqual(r2.code, 0, '有沒追蹤的新檔案（它也會被 COPY 進映像），release.sh 還是發佈了：git diff 看不到沒追蹤的檔案，用 git status --porcelain')
  const after = Object.fromEntries(await Promise.all((await registryTags('cafe-api')).map(async t => [t, await registryDigest('cafe-api', t)])))
  assert.deepEqual(after, before, '拒絕發佈時 registry 不能有任何改變（沒有新 tag、既有的 tag 也不能被覆蓋）')
})
