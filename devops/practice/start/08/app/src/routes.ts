// 咖啡店 API 的路由：只回 JSON，不連資料庫（資料庫在第 10 課才加進來）
import type { IncomingMessage, ServerResponse } from 'node:http'

const products = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

export const state = { draining: false }

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export function handle(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
  switch (path) {
    case '/health/live':
      return send(res, 200, { status: 'ok' })
    case '/health/ready':
      return state.draining ? send(res, 503, { status: 'draining' }) : send(res, 200, { status: 'ready' })
    case '/version':
      // 映像建置時要把這兩個值放進環境變數（第 8 課練習 3）
      return send(res, 200, {
        version: process.env.APP_VERSION || 'unknown',
        gitSha: process.env.GIT_SHA || 'unknown',
      })
    case '/products':
      return send(res, 200, products)
    default:
      return send(res, 404, { error: 'not found' })
  }
}
