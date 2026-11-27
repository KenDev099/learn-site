// 在 work/11 執行：node examples/serve-json.ts（PORT 環境變數可以換 port，預設 4000）
// 把庫存服務開在一般的 HTTP/1.1 伺服器上：Connect 協定的 unary 就是 POST + JSON，curl 和瀏覽器的 fetch 都能直接呼叫
import http from 'node:http'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { inventoryRoutes } from '../inventory.ts'

const port = Number(process.env.PORT ?? 4000)
const stock = new Map([['1', 12], ['2', 5], ['3', 8], ['4', 20], ['5', 0], ['6', 3]])
http.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) })).listen(port, () => {
  console.log(`庫存服務（HTTP/1.1，Connect 與 gRPC-Web 協定）：http://localhost:${port}（Ctrl+C 結束）`)
})
