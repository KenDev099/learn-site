// 練習 5：補貨查詢。GET /menu/:id/restock
// 呼叫供應商 GET {config.supplierUrl}/restock/{id}，上游回 { "productId": 2, "restockAt": "2026-11-02T08:00:00.000Z" }
//   成功回 200 { productId, restockAt }；我們沒有的商品回 404，不呼叫上游
//   每次呼叫最多等 1 秒；上游回 503 最多重試 2 次（有 Retry-After 照著等，超過 2 秒就不等了），其他狀態不重試
//   失敗一律丟 HttpError('upstream-unavailable', …)：detail 自己寫，上游的內容只進 log
//   客戶端離開時取消還在進行的上游請求（第 17 課）
import { HttpError, sendJson, type Ctx } from './platform/http.ts'

export async function getRestock({ res, params, config }: Ctx) {
  // TODO：現在沒有逾時、不重試，而且把上游的內容原樣轉給客戶端
  const upstream = await fetch(`${config.supplierUrl}/restock/${params[0]}`)
  if (!upstream.ok) throw new HttpError('upstream-unavailable', await upstream.text())
  sendJson(res, 200, await upstream.json())
}
