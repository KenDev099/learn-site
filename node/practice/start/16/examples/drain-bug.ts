// 最小重現：把含中文的「字串」寫進 chunked 回應，write() 回傳 false 之後等 drain
// 同樣的程式改寫 ASCII 字串或 Buffer 做對照。每種情況最多等 2 秒
import { createServer, get, type ServerResponse } from 'node:http'
import { once } from 'node:events'

const ROWS = 20_000
type Make = (i: number) => string | Buffer
const cases: [string, Make][] = [
  ['中文字串', i => `${i},拿鐵,110\n`],
  ['ASCII 字串', i => `${i},latte,110\n`],
  ['中文 Buffer', i => Buffer.from(`${i},拿鐵,110\n`)],
]

// 正確遵守背壓的寫法：write() 回傳 false 就等 drain
async function writeRows(res: ServerResponse, make: Make) {
  for (let i = 0; i < ROWS; i++) {
    if (!res.write(make(i))) await once(res, 'drain')
  }
  res.end()
}

console.log(`Node ${process.version}`)
for (const [name, make] of cases) {
  let written = 0
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })   // 沒有 Content-Length → chunked
    writeRows(res, i => { written = i + 1; return make(i) }).catch(() => {})
  })
  server.listen(0)
  await once(server, 'listening')
  const { port } = server.address() as { port: number }
  const result = await new Promise<string>(resolve => {
    const timer = setTimeout(() => resolve(`卡住了：寫到第 ${written} 列後一直等不到 drain`), 2000)
    get(`http://localhost:${port}/`, { agent: false }, res => {
      res.resume()
      res.on('end', () => { clearTimeout(timer); resolve(`完成 ${written} 列`) })
    })
  })
  console.log(`${name}：${result}`)
  server.closeAllConnections()
  server.close()
}
