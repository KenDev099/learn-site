// lost update：兩位店長都先讀、再整個寫回去，後寫的人蓋掉先寫的人
import { createServer } from 'node:http'

const latte = { id: 2, name: '拿鐵', price: 110 }

const server = createServer(async (req, res) => {
  if (req.method === 'PUT') {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    Object.assign(latte, JSON.parse(Buffer.concat(chunks).toString('utf8')))   // 不檢查任何條件，直接覆蓋
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(latte))
})

server.listen(0, async () => {
  const { port } = server.address() as { port: number }
  const url = `http://localhost:${port}/menu/2`
  const put = (body: unknown) => fetch(url, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.json())

  const a = await fetch(url).then(r => r.json())   // 店長 A 打開編輯頁
  const b = await fetch(url).then(r => r.json())   // 店長 B 也打開編輯頁
  console.log('A、B 讀到：', a)
  console.log('A 漲價成 120 →', await put({ ...a, price: 120 }))
  console.log('B 改名成「拿鐵（燕麥奶）」→', await put({ ...b, name: '拿鐵（燕麥奶）' }))
  console.log('最後：', latte, '← A 的漲價不見了')
  server.close()
})
