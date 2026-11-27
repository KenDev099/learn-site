// 練習 1：README 的結構、Mermaid 圖、連到的 ADR 都存在
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas', { http: false })
const readme = repoFile(t, 'README.md') ?? ''
const headings = [...readme.matchAll(/^#{2,3}\s+(.+)$/gm)].map(m => m[1].trim())
// README 與 docs/ 裡的 Mermaid 區塊
const mermaid = [readme, repoFile(t, 'docs/architecture.md') ?? ''].flatMap(s => [...s.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m => m[1].trim()))

const SECTIONS: [string, RegExp][] = [
  ['Demo（網址與示範帳號）', /demo|展示/i],
  ['架構', /架構|architecture/i],
  ['功能', /功能|features/i],
  ['設計決定（連到 ADR）', /設計決定|決策|design decisions|adr/i],
  ['如何執行', /如何執行|怎麼跑|getting started|run/i],
  ['測試', /測試|test/i],
  ['已知限制與下一步', /限制|limitations|下一步|roadmap/i],
]

describe('練習 1：README', () => {
  it('README.md 有這幾節：Demo、架構、功能、設計決定、如何執行、測試、已知限制', () => {
    expect(readme, 'repo 根目錄沒有 README.md').not.toBe('')
    const missing = SECTIONS.filter(([, re]) => !headings.some(h => re.test(h))).map(([name]) => name)
    expect(missing, `README 少了這幾節（## 標題）：${missing.join('、')}。現在的標題：${headings.join('、')}`).toEqual([])
  })

  it('有 Mermaid 的元件圖（flowchart）與一張請求時序圖（sequenceDiagram），放在 README 或 docs/architecture.md', () => {
    expect(mermaid.some(m => /^(flowchart|graph)\b/.test(m)), 'README 或 docs/architecture.md 要有 ```mermaid 的 flowchart（元件圖：api、worker、db、redis、storage、mail）').toBe(true)
    expect(mermaid.some(m => /^sequenceDiagram\b/.test(m)), 'README 或 docs/architecture.md 要有 ```mermaid 的 sequenceDiagram（一個帶租戶的請求從 guard 到 RLS）').toBe(true)
  })

  it('README 連到的 docs/ 檔案都存在', () => {
    const links = [...readme.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map(m => m[1]).filter(l => !/^[a-z]+:/i.test(l))
    expect(links.filter(l => /adr\//.test(l)).length, 'README 的設計決定要連到 docs/adr/ 裡的 ADR').toBeGreaterThan(0)
    const broken = links.filter(l => !existsSync(join(dirname(join(t.repo, 'README.md')), decodeURI(l))))
    expect(broken, `README 的連結指到不存在的檔案：${broken.join('、')}（檔名改過？）`).toEqual([])
  })
})
