// 前端建置時做的事：把每個操作的文字算出 sha256，產生 { 雜湊: 查詢 } 清單（第 7 課的 codegen 可以自動輸出）。
// node examples/manifest.ts：印出清單，並用 4000 port 開啟練習 4 的 createApp（正式模式），可以用 curl 試
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp } from '../persisted.ts'

const documents = [
  'query Menu { menu { name price } }',
  'query Product($id: ID!) { product(id: $id) { name price } }',
]
const operations = Object.fromEntries(documents.map(q => [createHash('sha256').update(q).digest('hex'), q]))
console.log(JSON.stringify(operations, null, 2))

const yoga = createApp({ operations })
const port = Number(process.env.PORT ?? 4000)
createServer(yoga).listen(port, () => console.log(`\nGraphQL 端點：http://localhost:${port}/graphql（Ctrl+C 結束）`))
