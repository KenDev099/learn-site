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

const json = (statusCode: number, data: unknown): HttpResult =>
  ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })

function validItems(items: unknown): items is Order['items'] {
  return Array.isArray(items) && items.length > 0 && items.every(i =>
    Number.isInteger(i?.productId) && Number.isInteger(i?.quantity) && i.quantity >= 1 && i.quantity <= 20)
}

export function createOrdersHandler(store: Store) {
  return async (event: HttpEvent): Promise<HttpResult> => {
    const sub = event.queryStringParameters?.userId ?? event.requestContext.authorizer?.jwt?.claims.sub
    if (!sub) return json(401, { message: '需要登入' })

    if (event.routeKey === 'GET /orders/{id}') {
      const order = await store.get(event.pathParameters?.id ?? '')
      // 別人的訂單和不存在的訂單回一樣的 404：不讓人試出哪些 id 存在
      if (!order || order.customerId !== sub) return json(404, { message: '找不到訂單' })
      return json(200, order)
    }

    if (event.routeKey === 'POST /orders') {
      const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? ''
      let input: any
      try { input = JSON.parse(raw) } catch { return json(400, { message: 'body 不是合法的 JSON' }) }
      if (!validItems(input?.items)) return json(400, { message: 'items 要是非空陣列，每項有整數 productId 與 1～20 的 quantity' })
      const order = await store.create({ customerId: sub, items: input.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })) })
      return json(201, order)
    }

    return json(404, { message: '沒有這個路由' })
  }
}
