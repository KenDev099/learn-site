// 在 work/09 執行：node examples/serve.ts（PORT 環境變數可以換 port，預設 4000）
// 用你在 server.ts 寫的 inventoryRoutes 開一個 gRPC 伺服器，給 buf curl、grpc-js 試著呼叫
import http2 from 'node:http2'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { inventoryRoutes } from '../server.ts'

const port = Number(process.env.PORT ?? 4000)
const stock = new Map([['1', 12], ['2', 5], ['3', 8], ['4', 20], ['5', 0], ['6', 3]])
http2.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) })).listen(port, () => {
  console.log(`庫存服務：http://localhost:${port}（HTTP/2 明文，Ctrl+C 結束）`)
})
