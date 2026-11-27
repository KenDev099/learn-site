import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { usePg } from '../../helpers/pg.ts'
import { useS3 } from '../../helpers/s3.ts'
import { createTables, ForbiddenError, ReceiptNotReadyError } from './receipts.ts'
import { getReceiptUrl } from './download.ts'

const pool = usePg(12)
const { s3, bucket } = useS3(12, 'receipts')
const body = new TextEncoder().encode('%PDF-1.7 訂單 15 的收據')
let mine = 0, others = 0, waiting = 0, othersWaiting = 0

describe('練習 3：發下載網址（getReceiptUrl）', { timeout: 120_000 }, () => {
  // 建表放在 describe 裡的 before：檔案最上層的 before 會跟 usePg、useS3 的準備同時執行
  before(async () => {
    await createTables(pool)
    await pool.query('INSERT INTO orders (id, customer_id) VALUES (15, 21), (16, 22)')
    const add = async (orderId: number, key: string, status: string) => {
      const { rows } = await pool.query(
        `INSERT INTO receipts (order_id, s3_key, content_type, size, status, created_at) VALUES ($1, $2, 'application/pdf', $3, $4, now()) RETURNING id`,
        [orderId, key, body.length, status])
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/pdf' }))
      return rows[0].id as number
    }
    mine = await add(15, 'receipts/2026/11/a1b2-15.pdf', 'uploaded')     // 客人 21 的
    others = await add(16, 'receipts/2026/11/c3d4-16.pdf', 'uploaded')   // 客人 22 的
    waiting = await add(15, 'receipts/2026/11/e5f6-15.pdf', 'pending')   // 客人 21 的，還沒確認
    othersWaiting = await add(16, 'receipts/2026/11/a7b8-16.pdf', 'pending')   // 客人 22 的，還沒確認
  })

  test('本人可以下載，回應帶 Content-Disposition: attachment 與檔名', async () => {
    const url = await getReceiptUrl(pool, { s3, bucket }, mine, 21, Date.now())
    const r = await fetch(url)
    assert.equal(r.status, 200, `用回傳的網址 GET 失敗（${r.status}）：要用 getSignedUrl 簽 GetObjectCommand，不是自己組網址`)
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), body, '下載到的內容跟上傳的不同')
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="receipt-15.pdf"',
      `Content-Disposition 應該是 attachment; filename="receipt-15.pdf"，實際是 ${r.headers.get('content-disposition')}：用 GetObjectCommand 的 ResponseContentDisposition`)
    assert.match(url, /X-Amz-Expires=60(&|$)/, '下載網址的有效期限要是 60 秒（DOWNLOAD_TTL）')
  })

  test('別人的收據、不存在的收據：都丟 ForbiddenError', async () => {
    await assert.rejects(getReceiptUrl(pool, { s3, bucket }, others, 21, Date.now()), ForbiddenError,
      '客人 21 拿到客人 22 的收據網址了（BOLA）：查詢要 JOIN orders，確認 customer_id 是本人')
    await assert.rejects(getReceiptUrl(pool, { s3, bucket }, 99_999, 21, Date.now()), ForbiddenError,
      '不存在的收據也丟 ForbiddenError，跟「不是你的」回一樣的錯')
    await assert.rejects(getReceiptUrl(pool, { s3, bucket }, othersWaiting, 21, Date.now()), ForbiddenError,
      '別人還在 pending 的收據要丟 ForbiddenError，不是 ReceiptNotReadyError：先確認是本人的，再看狀態，不然回應會洩漏這張收據存在')
  })

  test('還在 pending 的收據：丟 ReceiptNotReadyError', async () => {
    await assert.rejects(getReceiptUrl(pool, { s3, bucket }, waiting, 21, Date.now()), ReceiptNotReadyError,
      '狀態不是 uploaded 的收據還沒經過伺服器驗證，不能發下載網址')
  })

  test('2 分鐘前發的網址已經失效；物件本身不能匿名讀取', async () => {
    const url = await getReceiptUrl(pool, { s3, bucket }, mine, 21, Date.now() - 2 * 60_000)
    assert.notEqual((await fetch(url)).status, 200, '2 分鐘前發的下載網址還能用：expiresIn 要是 60 秒，signingDate 用 now')
    const plain = url.split('?')[0]
    assert.notEqual((await fetch(plain)).status, 200, '去掉簽章參數的網址也能下載：bucket 不可以公開')
  })
})
