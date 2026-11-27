// 用 HTTP 開啟這一課的 schema（範例資料）：node examples/serve.ts，再用 curl 或瀏覽器打開 http://localhost:4000/graphql
import { createServer } from 'node:http'
import { buildYoga } from '../server.ts'
import { createDb } from '../db.ts'

const yoga = buildYoga(createDb())
const port = Number(process.env.PORT ?? 4000)
createServer(yoga).listen(port, () => console.log(`GraphQL 端點：http://localhost:${port}${yoga.graphqlEndpoint}（Ctrl+C 結束）`))
