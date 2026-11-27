// 練習 3：錯誤處理。createApp 回傳設定好的 yoga：
// - 非預期的錯誤（SQL 錯誤、程式 bug）對客戶端遮罩成 Unexpected error.，原錯誤交給 logger.error 記錄
// - 預期中、要讓客戶端知道的錯誤（沒登入、沒權限、參數不對）用 GraphQLError 丟出，帶 extensions.code
// 這一題用到練習 1 的 decodeCursor
import { GraphQLError } from 'graphql'
import { createSchema, createYoga, maskError } from 'graphql-yoga'
import type { Db } from '../../helpers/db.ts'
import { decodeCursor } from './cursor.ts'

export type Logger = { error(err: unknown): void }
type Viewer = { id: string, role: 'customer' | 'staff' }
type Context = { db: Db, viewer: Viewer | null }

// 登入狀態從標頭來（示範用；真實專案從驗證過的 session 或 token 取得）
function viewerFrom(request: Request): Viewer | null {
  const id = request.headers.get('x-customer-id')
  if (!id) return null
  return { id, role: request.headers.get('x-role') === 'staff' ? 'staff' : 'customer' }
}

function requireViewer(ctx: Context): Viewer {
  // 刻意給客戶端看的錯誤：GraphQLError ＋ 穩定的代碼，客戶端依代碼決定要做什麼（跳到登入頁）
  if (!ctx.viewer) throw new GraphQLError('請先登入', { extensions: { code: 'UNAUTHENTICATED' } })
  return ctx.viewer
}

function requireStaff(ctx: Context): Viewer {
  const viewer = requireViewer(ctx)
  if (viewer.role !== 'staff') throw new GraphQLError('只有店員可以看營業額', { extensions: { code: 'FORBIDDEN' } })
  return viewer
}

const typeDefs = /* GraphQL */ `
  type Product { id: ID! name: String! price: Int! }
  type Order { id: ID! total: Int! }
  type Query {
    menu: [Product!]!
    "目前登入顧客的訂單，after 是游標（只往後翻）"
    myOrders(after: String): [Order!]
    "今天的營業額，只有店員能看"
    salesReport: Int
  }
`

export function createApp({ db, logger }: { db: Db, logger: Logger }) {
  const schema = createSchema<Context>({
    typeDefs,
    resolvers: {
      Query: {
        menu: (_: unknown, __: unknown, ctx: Context) => ctx.db.query('SELECT id, name, price FROM products ORDER BY id'),
        myOrders: (_: unknown, args: { after?: string | null }, ctx: Context) => {
          const viewer = requireViewer(ctx)
          const key = args.after ? decodeCursor(args.after) : null
          return ctx.db.query(
            `SELECT id, total FROM orders WHERE customer_id = $1 ${key ? 'AND (ordered_at, id) < ($2, $3)' : ''}
             ORDER BY ordered_at DESC, id DESC LIMIT 10`,
            key ? [viewer.id, key.orderedAt, key.id] : [viewer.id])
        },
        salesReport: async (_: unknown, __: unknown, ctx: Context) => {
          requireStaff(ctx)
          const [row] = await ctx.db.query<{ sum: number | null }>('SELECT sum(total)::int AS sum FROM orders')
          return row.sum ?? 0
        },
      },
    },
  })

  return createYoga({
    schema,
    context: ({ request }) => ({ db, viewer: viewerFrom(request) }),
    logging: false,
    maskedErrors: false,
  })
}
