// 304 不能有 body：就算程式寫了，Node 也會丟掉
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  res.writeHead(304, { etag: '"menu-v1"' })
  res.end('這段文字不會送出去')
})

server.listen(0, async () => {
  const { port } = server.address() as { port: number }
  const res = await fetch(`http://localhost:${port}/menu`, { headers: { 'if-none-match': '"menu-v1"' } })
  console.log('status:', res.status)
  console.log('etag:', res.headers.get('etag'))
  console.log('body:', JSON.stringify(await res.text()))
  server.close()
})
