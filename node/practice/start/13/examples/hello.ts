// node examples/hello.ts，然後在另一個終端機：curl -i http://localhost:3000/menu
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  console.log(req.method, req.url, req.headers['user-agent'])
  const body = Buffer.from(JSON.stringify([{ id: 2, name: '拿鐵', price: 110 }]))
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
  })
  res.end(body)
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
