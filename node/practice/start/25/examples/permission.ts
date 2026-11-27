// 執行：node --permission examples/permission.ts
// 再試：node --permission --allow-fs-read=./data examples/permission.ts
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'

async function attempt(name: string, fn: () => unknown) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (err) {
    const e = err as { code?: string, permission?: string, resource?: string }
    console.log(`✗ ${name}：${e.code} ${e.permission ?? ''} ${e.resource ?? ''}`)
  }
}

console.log('有沒有開 Permission Model：', process.permission?.has('fs.read', '/etc/hosts') === false ? '有' : '沒有')
await attempt('讀 data/orders.json', () => readFile('data/orders.json', 'utf8'))
await attempt('讀 /etc/hosts', () => readFile('/etc/hosts', 'utf8'))
await attempt('開子程序 ls', () => execFileSync('ls'))
// 網路：開一個伺服器，再用 fetch 連自己。Node 24 的 Permission Model 不管網路
const server = createServer((req, res) => res.end('hi')).listen(0)
await new Promise(r => server.once('listening', r))
const { port } = server.address() as { port: number }
await attempt('開伺服器、用 fetch 連線', async () => console.log('  回應：', await (await fetch(`http://localhost:${port}`)).text()))
server.close()
