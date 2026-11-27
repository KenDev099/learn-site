// 練習 3：POST /orders 經過三層：repository（資料庫）→ service（業務規則）→ handler（HTTP）
// 現在的寫法有好幾個常見的錯誤處理問題，找出來並修好
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { ConflictError, UpstreamError, ValidationError, toProblem, type FieldError } from './errors.ts'

export type NewOrder = { drink: string, qty: number }
export type Order = NewOrder & { id: number }

// 假資料庫：測試會傳入一個會丟出各種錯誤的版本。資料庫的錯誤帶 SQLSTATE code，例如
// 23505（unique 衝突）、57014（statement_timeout 取消了查詢）
export type Db = { insertOrder(order: NewOrder): Promise<Order> }
export type Logger = { error(fields: Record<string, unknown>): void }

// ── repository：只懂資料庫，把資料庫的錯誤翻成領域錯誤 ──
export function createRepository(db: Db, logger: Logger) {
  return {
    async insert(order: NewOrder) {
      try {
        return await db.insertOrder(order)
      } catch (err) {
        logger.error({ msg: 'insert failed', error: String(err) })
        const code = (err as { code?: unknown }).code
        if (code === '23505') throw new ConflictError('這筆訂單已經存在')
        if (code === '57014') throw new UpstreamError('資料庫查詢逾時')
        throw err
      }
    },
  }
}
type Repository = ReturnType<typeof createRepository>

// ── service：業務規則（驗證），不知道 HTTP ──
export function createService(repo: Repository, logger: Logger) {
  return {
    async placeOrder(input: unknown): Promise<Order | null> {
      const body = (input ?? {}) as Record<string, unknown>
      const errors: FieldError[] = []
      if (typeof body.drink !== 'string' || body.drink.trim() === '') errors.push({ field: 'drink', message: '要是非空字串' })
      if (!Number.isInteger(body.qty) || (body.qty as number) < 1 || (body.qty as number) > 20) errors.push({ field: 'qty', message: '要是 1 到 20 的整數' })
      if (errors.length) throw new ValidationError('訂單的欄位不對', errors)
      try {
        return await repo.insert({ drink: body.drink as string, qty: body.qty as number })
      } catch (err) {
        logger.error({ msg: 'placeOrder failed', error: String(err) })
        return null
      }
    },
  }
}

// ── handler：HTTP 的邊界，把結果和錯誤變成回應 ──
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (err) {
    throw new ValidationError('body 不是合法的 JSON', [], { cause: err })
  }
}

export function createApp({ db, logger }: { db: Db, logger: Logger }): Server {
  const service = createService(createRepository(db, logger), logger)
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/orders') {
      res.writeHead(404).end()
      return
    }
    try {
      const order = await service.placeOrder(await readJson(req))
      res.writeHead(201, { 'content-type': 'application/json; charset=utf-8', location: `/orders/${order?.id}` })
      res.end(JSON.stringify(order))
    } catch (err) {
      logger.error({ msg: 'request failed', errorId: randomUUID(), error: String(err) })
      const problem = toProblem(err, randomUUID())
      res.writeHead(problem.status, { 'content-type': 'application/problem+json; charset=utf-8' })
      res.end(JSON.stringify(problem))
    }
  })
}
