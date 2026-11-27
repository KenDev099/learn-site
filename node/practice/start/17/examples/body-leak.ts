// 不讀也不取消 body，連線就一直被占著：node examples/body-leak.ts
import { createServer } from 'node:http'
import { once } from 'node:events'

let open = 0
// 上游回 500，body 送得很慢（一直沒送完）
const server = createServer((req, res) => {
  open++
  res.on('close', () => open--)      // 客戶端關掉連線時觸發
  res.writeHead(500)
  res.write('error details…')
}).listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

async function trial(label: string, handle: (res: Response) => Promise<void>) {
  for (let i = 0; i < 5; i++) await handle(await fetch(base))
  await new Promise(r => setTimeout(r, 200))
  console.log(`${label}：5 個請求都處理完了，上游還有 ${open} 條連線被占著`)
}

await trial('只看 status，body 不管', async res => { if (!res.ok) return })
server.closeAllConnections()
await new Promise(r => setTimeout(r, 100))
await trial('await res.body?.cancel()', async res => { if (!res.ok) await res.body?.cancel() })

server.closeAllConnections()
server.close()
