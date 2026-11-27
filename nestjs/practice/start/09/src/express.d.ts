// declaration merging：@types/express 的 Request 繼承自全域的 Express.Request，在這裡加欄位
declare global {
  namespace Express {
    interface Request {
      requestId: string   // RequestIdMiddleware 套用在所有路由，handler 拿到時一定有值
    }
  }
}

export {}
