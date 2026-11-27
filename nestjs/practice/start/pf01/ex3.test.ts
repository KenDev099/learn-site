// 練習 3：開發用的 PostgreSQL 寫在 compose.yaml，port 只綁本機
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

type Port = { host_ip?: string; published?: string; target: number }
type Service = { image?: string; ports?: Port[] }

function services(): Record<string, Service> {
  const file = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].map(f => join(t.repo, f)).find(existsSync)
  if (!file) throw new Error('repo 根目錄找不到 compose.yaml')
  const r = spawnSync('docker', ['compose', '-f', file, 'config', '--format', 'json'], { encoding: 'utf8', timeout: 30_000 })
  if (r.status !== 0) throw new Error(`docker compose config 解析失敗（compose.yaml 寫錯了，或沒有安裝 Docker）：\n${r.stderr.slice(0, 500)}`)
  return JSON.parse(r.stdout).services ?? {}
}

describe('練習 3：compose.yaml', () => {
  it('有一個 PostgreSQL 服務（image 是 postgres:…）', () => {
    const pg = Object.entries(services()).filter(([, s]) => /^postgres(:|$)/.test(s.image ?? ''))
    expect(pg.length, 'compose.yaml 裡沒有 image: postgres:… 的服務').toBeGreaterThan(0)
  })

  it('PostgreSQL 的 port 只綁 127.0.0.1', () => {
    for (const [name, s] of Object.entries(services()).filter(([, s]) => /^postgres(:|$)/.test(s.image ?? ''))) {
      expect(s.ports?.length, `${name} 沒有開 port：本機的 API 連不到它`).toBeTruthy()
      for (const p of s.ports ?? []) {
        expect(p.host_ip, `${name} 的 port ${p.published}:${p.target} 綁在所有網路介面：改成 "127.0.0.1:${p.published}:${p.target}"，不然同一個網路的人都連得到你的資料庫`).toBe('127.0.0.1')
      }
    }
  })
})
