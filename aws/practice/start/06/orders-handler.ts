// 練習 3：API Gateway HTTP API（payload format 2.0）後面的訂單 Lambda
export type Order = { id: string, customerId: string, items: { productId: number, quantity: number }[] }
export type Store = {
  get(id: string): Promise<Order | undefined>
  create(order: Omit<Order, 'id'>): Promise<Order>
}
export type HttpEvent = {
  routeKey: string                                   // 例如 'GET /orders/{id}'
  pathParameters?: Record<string, string>
  queryStringParameters?: Record<string, string>
  headers: Record<string, string>
  body?: string
  isBase64Encoded: boolean
  requestContext: { authorizer?: { jwt?: { claims: Record<string, string> } } }
}
export type HttpResult = { statusCode: number, headers?: Record<string, string>, body?: string }

export function createOrdersHandler(store: Store) {
  return async (event: HttpEvent): Promise<HttpResult> => {
    // 1. 使用者是誰：JWT authorizer 驗過的 claims.sub；沒有就 401
    // 2. GET /orders/{id}：不存在、或不是本人的訂單，一律 404
    // 3. POST /orders：body 是字串，isBase64Encoded 時先解 base64；JSON 壞掉或 items 不合法回 400；
    //    建立時 customerId 用 sub，回 201 和建立好的訂單
    // 4. 其他 routeKey 回 404；回應的 body 一定是 JSON 字串，加上 content-type: application/json
    throw new Error('還沒寫')
  }
}
