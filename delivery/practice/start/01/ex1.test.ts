// 練習 1：修好 README 的「## 快速開始」，填 onboarding.json
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { codeBlocks, sections } from '../../helpers/docs.ts'
import { scripts } from '../../helpers/refs.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const read = (f: string) => readFileSync(join(dir, f), 'utf8')
const readme = read('README.md')
const quick = sections(readme).get('快速開始') ?? ''
const commands = codeBlocks(quick).join('\n').split('\n').map(l => l.trim()).filter(Boolean)
const onboarding = JSON.parse(read('onboarding.json'))

describe('練習 1：README 的快速開始', () => {
  it('README 有「## 快速開始」，裡面有指令的 code block', () => {
    expect(quick, 'README 找不到「## 快速開始」這個標題').not.toBe('')
    expect(commands.length, '「## 快速開始」裡要有 ``` 包起來的指令').toBeGreaterThan(0)
  })

  it('依序是：啟動資料庫 → 建表與種子資料 → 啟動系統', () => {
    const at = (cmd: string) => commands.findIndex(l => l.startsWith(cmd))
    const steps = ['docker compose up -d --wait', 'npm run db:setup', 'npm run dev']
    for (const s of steps) expect(at(s), `快速開始少了這個指令：${s}`).toBeGreaterThanOrEqual(0)
    const order = steps.map(at)
    expect(order, '順序要是 docker compose up -d --wait → npm run db:setup → npm run dev：資料庫要先起來、表要先建好，API 才能用').toEqual([...order].sort((a, b) => a - b))
  })

  it('寫到的每個 npm run 指令都真的存在', () => {
    const exists = scripts(dir)
    for (const [, name] of readme.matchAll(/npm run ([\w:-]+)/g)) {
      expect(exists[name], `package.json 沒有 "${name}" 這個 script：照著打會出現 Missing script`).toBeDefined()
    }
  })

  it('不再出現錯誤的 DB_HOST 與 3000 port', () => {
    expect(readme, 'API 不讀 DB_HOST：連線設定是哪個環境變數？看 api/.env.example 與 prisma.service.ts').not.toMatch(/DB_HOST/)
    expect(readme, 'API 不是開在 3000：看 api/src/main.ts 的 listen').not.toMatch(/\b3000\b/)
    expect(readme, '刪掉 DB_HOST 之後，要寫出真正的連線設定：API 讀哪個環境變數？看 api/.env.example').toMatch(/DATABASE_URL/)
    const port = read('api/src/main.ts').match(/PORT\s*\?\?\s*(\d+)/)?.[1]
    expect(readme, `刪掉 3000 之後，要寫出 API 真正的網址 http://localhost:${port}（看 api/src/main.ts 的 listen），新同事才知道去哪裡測`).toContain(`localhost:${port}`)
  })
})

describe('練習 1：onboarding.json', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())

  it('apiPort 是 API 實際的預設 port', () => {
    const port = Number(read('api/src/main.ts').match(/PORT\s*\?\?\s*(\d+)/)?.[1])
    expect(onboarding.apiPort, `apiPort 要跟 api/src/main.ts 的預設值一樣（不是 README 寫的）`).toBe(port)
  })

  it('webPort 是前台實際的 port', () => {
    const port = Number(read('web/vite.config.ts').match(/port:\s*(\d+)/)?.[1])
    expect(onboarding.webPort, 'webPort 要跟 web/vite.config.ts 的 server.port 一樣').toBe(port)
  })

  it('healthPath 打得通（200）', async () => {
    expect(onboarding.healthPath, 'healthPath 要是以 / 開頭的路徑，例如 /xxx').toMatch(/^\//)
    const res = await request(app.getHttpServer()).get(onboarding.healthPath)
    expect(res.status, `GET ${onboarding.healthPath} 回 ${res.status}，不是 200`).toBe(200)
    expect(res.body, `GET ${onboarding.healthPath} 不是健康檢查：健康檢查回 {"status":"ok"}，看 api/src/app.module.ts`).toEqual({ status: 'ok' })
  })
})
