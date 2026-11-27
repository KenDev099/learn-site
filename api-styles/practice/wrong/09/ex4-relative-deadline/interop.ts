// 練習 4：不用 Connect，改用 Node 官方的 gRPC 實作 @grpc/grpc-js 呼叫同一個伺服器
import { fileURLToPath } from 'node:url'
import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'

// 同一份 .proto：grpc-js 不需要事先產生程式碼，執行時才讀檔
export const PROTO = fileURLToPath(new URL('./proto/coffee/inventory/v1/inventory.proto', import.meta.url))

// proto-loader 在執行時才知道有哪些方法，TypeScript 看不到，所以自己寫出用得到的部分
type Level = { productId: string, available: number }
type GetStockCallback = (err: grpc.ServiceError | null, res?: { levels: Record<string, Level> }) => void
export type InventoryClient = grpc.Client & {
  getStock(req: { productIds: string[] }, options: grpc.CallOptions, callback: GetStockCallback): void
}
type InventoryClientCtor = new (address: string, credentials: grpc.ChannelCredentials) => InventoryClient

export type GrpcJsResult =
  | { ok: true, levels: Record<string, number> }              // 商品 id → 剩幾份
  | { ok: false, code: string, message: string }              // code 是狀態碼的名稱，例如 'NOT_FOUND'

// defaults: true：沒送出的欄位補上預設值（proto3 不送 0，不設的話庫存 0 會讀成 undefined）
const definition = protoLoader.loadSync(PROTO, { defaults: true })
const loaded = grpc.loadPackageDefinition(definition) as unknown as { coffee: { inventory: { v1: { InventoryService: InventoryClientCtor } } } }
const InventoryService = loaded.coffee.inventory.v1.InventoryService

// address 例如 '127.0.0.1:4000'；ms 是這次呼叫的 deadline 預算
export function callWithGrpcJs(address: string, ids: string[], ms: number): Promise<GrpcJsResult> {
  const client = new InventoryService(address, grpc.credentials.createInsecure())
  return new Promise(resolve => {
    // grpc-js 的 deadline 是絕對時間點：現在 + 預算
    client.getStock({ productIds: ids }, { deadline: ms }, (err, res) => {
      client.close()
      if (err) return resolve({ ok: false, code: grpc.status[err.code], message: err.details })
      const levels = Object.fromEntries(Object.entries(res!.levels).map(([id, level]) => [id, level.available]))
      resolve({ ok: true, levels })
    })
  })
}
