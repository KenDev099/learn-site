// 練習 1：多階段 Dockerfile、非 root、.dockerignore
import { repoFile, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'small', { http: false })

// Dockerfile 的指令：去掉註解、接起 \ 換行，回傳 [指令, 參數]
function instructions(): [string, string][] {
  const text = repoFile(t, 'Dockerfile')
  if (text === null) throw new Error('repo 根目錄找不到 Dockerfile')
  return text.replace(/\\\r?\n/g, ' ').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const [cmd, ...rest] = l.split(/\s+/); return [cmd.toUpperCase(), rest.join(' ')] })
}

describe('練習 1：Dockerfile 與 .dockerignore', () => {
  it('多階段建置：至少兩個 FROM', () => {
    const froms = instructions().filter(([c]) => c === 'FROM').length
    expect(froms, `只有 ${froms} 個 FROM：建置（npm ci、nest build）放一個 stage，最後的映像另開一個 stage，只複製 dist 與正式依賴`).toBeGreaterThanOrEqual(2)
  })

  it('最後一個 stage 用非 root 的 USER 執行', () => {
    const all = instructions()
    const last = all.slice(all.map(([c]) => c).lastIndexOf('FROM'))
    const user = last.filter(([c]) => c === 'USER').at(-1)?.[1]
    expect(user, '最後一個 stage 沒有 USER：預設是 root。node 官方映像已經有 node 使用者，加 USER node').toBeTruthy()
    expect(/^(root|0)(:|$)/.test(user!), `USER ${user} 還是 root：改成 USER node`).toBe(false)
  })

  it('.dockerignore 排除 node_modules 與 .env', () => {
    const lines = (repoFile(t, '.dockerignore') ?? '').split('\n').map(l => l.trim().replace(/^\/|\/$/g, ''))
    expect(lines.some(l => /^(\*\*\/)?node_modules$/.test(l)), '.dockerignore 要有 node_modules：本機的 node_modules（macOS 編譯的）不能被 COPY 進 Linux 映像').toBe(true)
    expect(lines.some(l => /^(\*\*\/)?\.env(\*|\.\*)?$/.test(l)), '.dockerignore 要有 .env：COPY . . 會把密碼包進映像，拿到映像的人都看得到').toBe(true)
  })
})
