// 練習 2：映像與類正式的 compose：非 root、健康檢查、migration 是獨立的一次性服務
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })

type Service = { image?: string; build?: unknown; command?: string[] | null; entrypoint?: string[] | null; depends_on?: Record<string, { condition: string }>; ports?: { host_ip?: string; published?: string; target: number }[]; healthcheck?: { test?: string[] } }

function services(): Record<string, Service> {
  const file = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].map(f => join(t.repo, f)).find(existsSync)
  if (!file) throw new Error('repo 根目錄找不到 compose.yaml')
  // --profile '*'：類正式的服務常放在 profile 裡，全部打開來看
  const r = spawnSync('docker', ['compose', '-f', file, '--profile', '*', 'config', '--format', 'json'], { encoding: 'utf8', timeout: 30_000 })
  if (r.status !== 0) throw new Error(`docker compose config 解析失敗：\n${r.stderr.slice(0, 500)}`)
  return JSON.parse(r.stdout).services ?? {}
}
const cmd = (s: Service) => [...(s.entrypoint ?? []), ...(s.command ?? [])].join(' ')
const all = services()
const byImage = (re: RegExp) => Object.entries(all).filter(([, s]) => re.test(s.image ?? ''))
// Dockerfile 的指令（去掉註解、接起 \ 換行）
const docker = (repoFile(t, 'Dockerfile') ?? '').replace(/^\s*#.*$/gm, '').replace(/\\\n/g, ' ').split('\n').map(l => l.trim()).filter(Boolean)
const lastStage = docker.slice(docker.findLastIndex(l => /^FROM\s/i.test(l)))
// api：自己 build、有對外 port 的服務；migrate：跑 migrate deploy、沒有 port 的一次性服務
const apis = Object.entries(all).filter(([, s]) => s.build && s.ports?.length)
const migrates = Object.entries(all).filter(([, s]) => /migrate deploy/.test(cmd(s)) && !s.ports?.length)

describe('練習 2：Dockerfile 與 compose', () => {
  it('Dockerfile 是多階段建置，最後一個 stage 用非 root 執行', () => {
    expect(docker.length, 'repo 根目錄找不到 Dockerfile').toBeGreaterThan(0)
    expect(docker.filter(l => /^FROM\s/i.test(l)).length, '要至少兩個 FROM：建置用的工具與 devDependencies 不要進正式映像').toBeGreaterThanOrEqual(2)
    const user = lastStage.filter(l => /^USER\s/i.test(l)).pop()?.split(/\s+/)[1]
    expect(user, '最後一個 stage 要有 USER（例如 node）：容器被攻破時，攻擊者拿到的是 root 還是一般使用者，差很多').toBeTruthy()
    expect(['root', '0', '0:0'], `USER ${user} 還是 root`).not.toContain(user)
  })

  it('.dockerignore 排除 node_modules 與 .env', () => {
    const lines = (repoFile(t, '.dockerignore') ?? '').split('\n').map(l => l.trim().replace(/^\/|\/$/g, ''))
    expect(lines, '.dockerignore 要有 node_modules：本機的 node_modules 不要送進 build context').toContain('node_modules')
    expect(lines.some(l => /^\.env(\*|\.\*)?$/.test(l)), '.dockerignore 要有 .env：COPY . . 會把密碼複製進映像，任何拿到映像的人都看得到').toBe(true)
  })

  it('Dockerfile 用 npm ci 時，repo 有 package-lock.json（出題檢查時略過）', () => {
    if (t.verify) return   // 參考實作借用 nestjs/practice 的 node_modules，沒有自己的 lockfile
    if (!docker.some(l => /npm ci\b/.test(l))) return
    expect(existsSync(join(t.repo, 'package-lock.json')), 'Dockerfile 用 npm ci，但 repo 沒有 package-lock.json：npm ci 一定要 lockfile，build 會失敗').toBe(true)
  })

  it('compose 有 PostgreSQL、Redis、一次性的 migrate 服務與 api', () => {
    expect(byImage(/^postgres(:|$)/).length, 'compose 裡沒有 image: postgres:… 的服務').toBeGreaterThan(0)
    expect(byImage(/^redis(:|$)/).length, 'compose 裡沒有 image: redis:… 的服務').toBeGreaterThan(0)
    expect(migrates.length, '要有一個 command 是 prisma migrate deploy、沒有開 port 的服務（跑完就結束）').toBeGreaterThan(0)
  })

  it('api 不在啟動時跑 migration，而是等 migrate 跑完、db 與 redis 健康才啟動', () => {
    expect(apis.length, '找不到 api 服務（有 build、有 ports 的服務）').toBeGreaterThan(0)
    for (const [name, s] of apis) {
      expect(cmd(s), `${name} 的 command 在啟動時跑 migration：3 個副本同時啟動就有 3 個 migration 搶著改 schema，失敗時 api 也起不來。改成獨立的 migrate 服務`).not.toMatch(/migrate deploy/)
      const deps = s.depends_on ?? {}
      expect(Object.values(deps).some(d => d.condition === 'service_completed_successfully'), `${name} 要 depends_on migrate，condition: service_completed_successfully`).toBe(true)
      for (const [db] of [...byImage(/^postgres(:|$)/), ...byImage(/^redis(:|$)/)]) {
        expect(deps[db]?.condition, `${name} 要 depends_on ${db}，condition: service_healthy（${db} 要有 healthcheck）`).toBe('service_healthy')
      }
    }
  })

  it('api 有健康檢查（Dockerfile 的 HEALTHCHECK 或 compose 的 healthcheck）', () => {
    const inDockerfile = lastStage.some(l => /^HEALTHCHECK\s+(?!NONE)/i.test(l))
    for (const [name, s] of apis) expect(inDockerfile || !!s.healthcheck?.test?.length, `${name} 沒有健康檢查：Dockerfile 加 HEALTHCHECK 打 /health/ready，或在 compose 的 ${name} 加 healthcheck`).toBe(true)
  })

  it('所有對外的 port 只綁 127.0.0.1', () => {
    for (const [name, s] of Object.entries(all)) for (const p of s.ports ?? []) {
      expect(p.host_ip, `${name} 的 port ${p.published}:${p.target} 綁在所有網路介面：改成 "127.0.0.1:${p.published}:${p.target}"`).toBe('127.0.0.1')
    }
  })
})
