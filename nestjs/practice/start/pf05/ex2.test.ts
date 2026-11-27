// 練習 2：README 的骨架，而且「如何執行」寫的指令在 repo 裡真的存在
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })
const readme = repoFile(t, 'README.md')

// README 的 ## 標題 → 底下的內容
function sections(): Map<string, string> {
  if (readme === null) throw new Error('repo 根目錄找不到 README.md')
  const map = new Map<string, string>()
  let current = ''
  for (const line of readme.split('\n')) {
    const h = line.match(/^#{2,3}\s+(.+?)\s*#*\s*$/)
    if (h) { current = h[1]; map.set(current, '') } else if (current) map.set(current, map.get(current) + line + '\n')
  }
  return map
}
const find = (s: Map<string, string>, title: string) => [...s.keys()].find(k => k.includes(title))

describe('練習 2：README', () => {
  it('有「如何執行」「架構」「API」「測試」「設計決定」五個標題（## 或 ###）', () => {
    const s = sections()
    const missing = ['如何執行', '架構', 'API', '測試', '設計決定'].filter(x => !find(s, x))
    expect(missing, `README 少了這些標題：${missing.join('、')}（標題文字要包含這幾個字，例如「## 如何執行」）`).toEqual([])
  })

  it('「如何執行」裡的 npm run 指令都在 package.json 的 scripts，提到 docker compose 就要有 compose.yaml', () => {
    const s = sections()
    const run = s.get(find(s, '如何執行') ?? '') ?? ''
    expect(/```|^ {4}\S/m.test(run), '「如何執行」要有可以照著打的指令（放在 ``` 區塊裡）').toBe(true)
    const scripts = Object.keys(JSON.parse(repoFile(t, 'package.json') ?? '{}').scripts ?? {})
    const used = [...run.matchAll(/npm\s+run\s+([\w:.-]+)/g)].map(m => m[1])
    const missing = used.filter(x => !scripts.includes(x))
    expect(missing, `README 寫了 npm run ${missing.join('、npm run ')}，package.json 的 scripts 沒有：照著 README 打的人第一步就失敗`).toEqual([])
    if (/npm\s+test\b/.test(run)) expect(scripts, 'README 寫了 npm test，package.json 沒有 test script').toContain('test')
    if (/docker\s+compose/.test(run)) {
      const compose = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].some(f => existsSync(join(t.repo, f)))
      expect(compose, 'README 寫了 docker compose，repo 根目錄卻沒有 compose.yaml').toBe(true)
    }
    if (/\.env\.example/.test(run)) expect(repoFile(t, '.env.example'), 'README 寫了 .env.example，repo 裡沒有這個檔案').not.toBeNull()
  })
})
