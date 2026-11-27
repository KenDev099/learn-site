// 練習 2：第一份 ADR 與架構說明放在 repo 裡
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })

// 四段的標題：中文或英文都可以（# 到 ###### 都算）
const SECTIONS = [['狀態', 'Status'], ['背景', 'Context'], ['決定', 'Decision'], ['後果', 'Consequences']]
const heading = (md: string, names: string[]) => new RegExp(`^#{1,6}\\s*(${names.join("|")})`, 'mi').test(md)

describe('練習 2：ADR 0001 與架構說明', () => {
  it('docs/adr/0001-*.md 存在，有「狀態、背景、決定、後果」四段', () => {
    const dir = join(t.repo, 'docs', 'adr')
    const file = existsSync(dir) ? readdirSync(dir).find(f => /^0001-.+\.md$/.test(f)) : undefined
    expect(file, `找不到 docs/adr/0001-<主題>.md（例如 docs/adr/0001-tenant-isolation.md）：第一份 ADR 寫租戶隔離方式`).toBeTruthy()
    const md = readFileSync(join(dir, file!), 'utf8')
    for (const names of SECTIONS) {
      expect(heading(md, names), `${file} 少了「${names[0]}」這一段：用 Markdown 標題（例如 ## ${names[0]}）。四段是 狀態、背景、決定、後果`).toBe(true)
    }
    const body = (name: string) => md.split(new RegExp(`^#{1,6}\\s*${name}.*$`, 'm'))[1]?.split(/^#{1,6}\s/m)[0].trim() ?? ''
    expect(body("(?:後果|Consequences)").length, `${file} 的「後果」是空的：寫出這個決定的好處與代價`).toBeGreaterThan(10)
  })

  it('有架構說明：docs/architecture.md，或 README 有「架構」標題', () => {
    const arch = repoFile(t, 'docs/architecture.md')
    const readme = repoFile(t, 'README.md') ?? ''
    expect(arch !== null || /^#{1,6}\s*(架構|Architecture)/mi.test(readme), '要有 docs/architecture.md，或在 README.md 加一段「## 架構」：列出模組與依賴方向').toBe(true)
  })
})
