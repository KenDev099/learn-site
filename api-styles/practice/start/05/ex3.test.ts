import test from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../../helpers/coffee.ts'
import { createDb } from '../../helpers/db.ts'
import { gql } from '../../helpers/graphql.ts'
import { createApp } from './errors.ts'

const opts = { timeout: 10_000 }
// NODE_ENV=development 時 Yoga 會把原錯誤放進 extensions.originalError（方便開發）；這裡測正式環境的行為
process.env.NODE_ENV = 'production'

const random = mulberry32(Date.now())
const { db, pg } = await createDb()
// 商品名稱每次不同（menu 要從資料庫讀）；模擬 migration 把 orders.total 改了名、程式還沒跟著改 → 查 total 的 SQL 會失敗
const tag = String(10 + Math.floor(random() * 90))
await pg.exec(`UPDATE products SET name = name || '${tag}'; ALTER TABLE orders RENAME COLUMN total TO total_${tag}`)
const names = (await pg.query<{ name: string }>('SELECT name FROM products ORDER BY id')).rows.map(r => r.name)

const logged: unknown[] = []
const yoga = createApp({ db, logger: { error: (err: unknown) => { logged.push(err) } } })
const STAFF = { 'x-customer-id': '1', 'x-role': 'staff' }
const CUSTOMER = { 'x-customer-id': '2' }

type Body = Awaited<ReturnType<typeof gql>>['body']
const show = (b: Body) => JSON.stringify(b.errors ?? '沒有 errors')
const messageOf = (e: unknown) => String((e as Error)?.message ?? e)

test('非預期錯誤（SQL 錯誤）：客戶端只看到 Unexpected error.，原錯誤記一次 log，其他欄位照常有資料', opts, async () => {
  logged.length = 0
  const res = await gql(yoga, '{ menu { name } salesReport }', undefined, STAFF)
  const text = JSON.stringify(res.body.errors?.map(({ locations, ...e }: any) => e))
  assert.doesNotMatch(text, /total|column|does not exist|relation|orders/i,
    `回應裡出現了 SQL 錯誤的內容（${show(res.body)}）：不要用 maskedErrors: false。表名、欄位名會告訴攻擊者資料庫的結構`)
  assert.equal(res.body.errors?.length, 1,
    `errors 要剛好有 salesReport 的那一個錯誤（現在：${show(res.body)}）。不要在 resolver 裡 catch 之後回傳 null：客戶端會以為營業額是空的，監控也看不到錯誤`)
  const [err] = res.body.errors!
  assert.equal(err.message, 'Unexpected error.', '非預期錯誤對外的訊息是 Yoga 預設的 Unexpected error.')
  assert.equal(err.extensions?.code, 'INTERNAL_SERVER_ERROR', '非預期錯誤的 extensions.code 是 INTERNAL_SERVER_ERROR（交給 Yoga 匯出的 maskError 處理就會有）')
  assert.deepEqual(err.path, ['salesReport'], 'errors[0].path 要指出是 salesReport 出錯')
  assert.equal(res.status, 200, '執行階段的錯誤，HTTP 狀態仍是 200')
  assert.deepEqual(res.body.data?.menu?.map((p: { name: string }) => p.name), names, '部分成功：salesReport 失敗時，menu 仍要有資料')
  assert.equal(res.body.data?.salesReport, null, 'salesReport 失敗，值是 null')
  assert.equal(logged.length, 1, `logger.error 要剛好被呼叫一次（現在 ${logged.length} 次）：在 maskError 裡，錯誤被遮罩時記錄原錯誤`)
  assert.match(messageOf(logged[0]), /total/, `logger.error 要收到原本的錯誤（含 SQL 的錯誤訊息），不是遮罩後的 Unexpected error.（收到：${messageOf(logged[0])}）`)
})

test('沒登入：UNAUTHENTICATED，保留訊息，不記成錯誤 log', opts, async () => {
  logged.length = 0
  const { body } = await gql(yoga, '{ menu { name } myOrders { id } }')
  const err = body.errors?.[0]
  assert.equal(err?.extensions?.code, 'UNAUTHENTICATED',
    `沒登入要回 extensions.code UNAUTHENTICATED（現在：${show(body)}）。用 new GraphQLError(訊息, { extensions: { code: 'UNAUTHENTICATED' } })，一般的 Error 會被遮罩成 Unexpected error.`)
  assert.ok(err.message && err.message !== 'Unexpected error.', '預期中的錯誤要保留給使用者看的訊息')
  assert.deepEqual(body.data?.menu?.map((p: { name: string }) => p.name), names, 'myOrders 失敗時 menu 仍要有資料')
  assert.equal(logged.length, 0, `沒登入是預期中的情況，不要記成錯誤 log（logger.error 被呼叫了 ${logged.length} 次）：只有被遮罩的錯誤才記`)
})

test('沒權限：FORBIDDEN，保留訊息，不記成錯誤 log', opts, async () => {
  logged.length = 0
  const { body } = await gql(yoga, '{ salesReport }', undefined, CUSTOMER)
  const err = body.errors?.[0]
  assert.equal(err?.extensions?.code, 'FORBIDDEN', `已登入但不是店員要回 FORBIDDEN（現在：${show(body)}）`)
  assert.ok(err.message && err.message !== 'Unexpected error.', '預期中的錯誤要保留給使用者看的訊息')
  assert.equal(logged.length, 0, '沒權限是預期中的情況，不要記成錯誤 log')
})

test('壞掉的游標：BAD_USER_INPUT，不記成錯誤 log（用練習 1 的 decodeCursor）', opts, async () => {
  for (const after of ['%%%', Buffer.from('{"oops"').toString('base64url'), Buffer.from(`["2026-10-20T00:00:00.000Z","1; DROP TABLE orders"]`).toString('base64url')]) {
    logged.length = 0
    const { body } = await gql(yoga, 'query ($after: String) { myOrders(after: $after) { id } }', { after }, CUSTOMER)
    const err = body.errors?.[0]
    assert.equal(err?.extensions?.code, 'BAD_USER_INPUT', `after: "${after}" 要回 BAD_USER_INPUT（現在：${show(body)}）。先完成練習 1 的 decodeCursor`)
    assert.equal(logged.length, 0, '客戶端傳錯參數是預期中的情況，不要記成錯誤 log')
  }
})
