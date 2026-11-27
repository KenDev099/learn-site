// 練習 2：compose 的類正式設定：db 健康檢查 → migrate 跑完 → api
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

type Dep = { condition?: string }
type Service = { image?: string; command?: string[] | string; entrypoint?: string[] | string; healthcheck?: { test?: string[]; disable?: boolean }; depends_on?: Record<string, Dep> }

// --profile '*'：放在 profile 裡的服務（例如 profiles: [app]）也一起解析
function services(): Record<string, Service> {
  const file = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].map(f => join(t.repo, f)).find(existsSync)
  if (!file) throw new Error('repo 根目錄找不到 compose.yaml')
  const r = spawnSync('docker', ['compose', '-f', file, '--profile', '*', 'config', '--format', 'json'], { encoding: 'utf8', timeout: 30_000 })
  if (r.status !== 0) throw new Error(`docker compose config 解析失敗（compose.yaml 寫錯了，或沒有安裝 Docker）：\n${r.stderr.slice(0, 500)}`)
  return JSON.parse(r.stdout).services ?? {}
}
const words = (v: string[] | string | undefined) => [v ?? []].flat().join(' ')
const all = services()
const db = Object.keys(all).find(n => /^postgres(:|$)/.test(all[n].image ?? ''))
const cmd = (n: string) => words(all[n].command) + ' ' + words(all[n].entrypoint)
// migrate：只跑 migrate deploy 的服務（command 裡還用 && 啟動程式的，是「啟動時跑 migration」的 api）
const migrate = Object.keys(all).find(n => /migrate\s+deploy/.test(cmd(n)) && !/&&|;/.test(cmd(n)))
const apis = Object.keys(all).filter(n => n !== db && n !== migrate)

describe('練習 2：compose.yaml 的 db、migrate、api', () => {
  it('db（postgres 映像）有 healthcheck', () => {
    expect(db, 'compose.yaml 裡沒有 image: postgres:… 的服務').toBeTruthy()
    const hc = all[db!].healthcheck
    expect(Boolean(hc?.test?.length) && !hc?.disable, `${db} 沒有 healthcheck：沒有它，別的服務沒辦法等「資料庫真的能連」，只能等「容器啟動了」。用 pg_isready`).toBe(true)
  })

  it('有一個一次性的 migrate 服務（command 是 prisma migrate deploy），等 db healthy 才跑', () => {
    expect(migrate, '找不到 command 含 migrate deploy 的服務：migration 放在獨立的一次性服務，不要放在 api 啟動時').toBeTruthy()
    expect(all[migrate!].depends_on?.[db!]?.condition, `${migrate} 要 depends_on ${db}，condition: service_healthy`).toBe('service_healthy')
  })

  it('api 啟動時不跑 migration，而是等 db healthy、migrate 成功結束', () => {
    expect(apis.length, '除了 db 與 migrate，還要有 api 服務').toBeGreaterThan(0)
    const api = apis.find(n => migrate && all[n].depends_on?.[migrate]) ?? apis[0]
    const s = all[api]
    expect(/migrate/.test(cmd(api)), `${api} 的 command 裡有 migrate：3 個副本會同時改 schema，交給一次性的 migrate 服務`).toBe(false)
    expect(migrate, 'api 要等的 migrate 服務不存在').toBeTruthy()
    expect(s.depends_on?.[db!]?.condition, `${api} 要 depends_on ${db}，condition: service_healthy（沒寫 condition 只等容器啟動，資料庫可能還不能連）`).toBe('service_healthy')
    expect(s.depends_on?.[migrate!]?.condition, `${api} 要 depends_on ${migrate}，condition: service_completed_successfully（migration 失敗時 api 就不啟動）`).toBe('service_completed_successfully')
  })
})
