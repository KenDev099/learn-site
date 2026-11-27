// 用 HTTP 開啟你在練習 3 寫的 server.ts：node examples/serve.ts，再用 curl 或瀏覽器打開 http://localhost:4000/graphql
import { createServer } from 'node:http'
import { yoga } from '../server.ts'

const port = Number(process.env.PORT ?? 4000)
createServer(yoga).listen(port, () => console.log(`GraphQL 端點：http://localhost:${port}${yoga.graphqlEndpoint}（Ctrl+C 結束）`))
