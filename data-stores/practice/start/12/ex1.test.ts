import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { usePg } from '../../helpers/pg.ts'
import { useS3 } from '../../helpers/s3.ts'
import { createTables, MAX_SIZE, UploadRejectedError } from './receipts.ts'
import { createS3, createUpload } from './upload.ts'

const pool = usePg(12)
const { bucket } = useS3(12, 'receipts')

const pdf = new TextEncoder().encode('%PDF-1.7 收據 #15')
const put = (url: string, type = 'application/pdf') => fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: pdf })
const input = (over = {}) => ({ orderId: 15, fileName: 'receipt.pdf', contentType: 'application/pdf', size: pdf.length, now: Date.now(), ...over })
const why = async (r: Response) => r.ok ? '' : `（${r.status}：${(await r.text()).match(/<Message>(.*?)<\/Message>/)?.[1] ?? ''}）`

describe('練習 1：發上傳網址（createUpload）', { timeout: 120_000 }, () => {
  // 建表放在 describe 裡的 before：檔案最上層的 before 會跟 usePg、useS3 的準備同時執行
  before(async () => {
    await createTables(pool)
    await pool.query('INSERT INTO orders (id, customer_id) VALUES (15, 21), (16, 22)')
  })

  test('回傳的網址可以直接 PUT 一個 PDF，key 的格式正確，且已建立 pending 紀錄', async () => {
    const s3 = createS3()
    const now = Date.now()
    const t = await createUpload(pool, { s3, bucket }, input({ now }))
    const d = new Date(now)
    const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    assert.match(t.key, new RegExp(`^receipts/${ym}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.pdf$`),
      `key 要是 receipts/${ym}/<uuid>.pdf，實際是 ${t.key}`)
    const r = await put(t.url)
    assert.equal(r.status, 200, `用 PUT 上傳到回傳的網址失敗${await why(r)}。InvalidDigest 代表 createS3 沒處理 checksum；SignatureDoesNotMatch 檢查簽章參數`)
    const { rows } = await pool.query('SELECT id, order_id, s3_key, content_type, size, status FROM receipts')
    assert.equal(rows.length, 1, `receipts 應該有 1 筆紀錄，實際 ${rows.length} 筆：發網址前要先寫 pending 紀錄`)
    assert.deepEqual(rows[0], { id: t.receiptId, order_id: 15, s3_key: t.key, content_type: 'application/pdf', size: pdf.length, status: 'pending' },
      '紀錄的內容不對：receiptId 是新增那筆的 id，status 是 pending')
    s3.destroy()
  })

  test('key 不含使用者的檔名，每次都不同', async () => {
    const s3 = createS3()
    const a = await createUpload(pool, { s3, bucket }, input({ fileName: '../../orders/16/receipt.pdf' }))
    const b = await createUpload(pool, { s3, bucket }, input({ fileName: '../../orders/16/receipt.pdf' }))
    assert.ok(!a.key.includes('..') && !a.key.includes('orders/16'), `key 用了使用者給的檔名：${a.key}。檔名可以被竄改成別人的路徑，key 一律自己產生`)
    assert.notEqual(a.key, b.key, '兩次上傳拿到同一個 key，後上傳的會覆蓋前一個：key 要用 randomUUID()')
    s3.destroy()
  })

  test('網址 5 分鐘後失效、只能上傳簽好的 Content-Type', async () => {
    const s3 = createS3()
    const oldNow = Date.now() - 6 * 60_000
    const old = await createUpload(pool, { s3, bucket }, input({ now: oldNow }))
    const { rows } = await pool.query('SELECT created_at FROM receipts WHERE id = $1', [old.receiptId])
    assert.equal(rows[0]?.created_at?.getTime(), oldNow, 'created_at 要用傳入的 now，不是資料庫或電腦的現在時間：清理排程靠它判斷 pending 是否超時')
    const r1 = await put(old.url)
    assert.notEqual(r1.status, 200, '6 分鐘前發的網址還能上傳：expiresIn 要是 UPLOAD_TTL（300 秒），signingDate 用 now')
    assert.match(old.url, /X-Amz-Expires=300(&|$)/, '網址的有效期限要是 300 秒')
    const t = await createUpload(pool, { s3, bucket }, input())
    const r2 = await put(t.url, 'text/html')
    assert.notEqual(r2.status, 200, '用 text/html 也能上傳成功：getSignedUrl 預設不簽 Content-Type，要用 signableHeaders 把 content-type 簽進去')
    s3.destroy()
  })

  test('不是 PDF、太大或大小不合理：丟 UploadRejectedError，不寫任何紀錄', async () => {
    const s3 = createS3()
    const before = (await pool.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n
    for (const [over, what] of [
      [{ contentType: 'text/html' }, 'text/html'],
      [{ contentType: 'application/pdf; charset=utf-8' }, '帶參數的 PDF 型別'],
      [{ size: MAX_SIZE + 1 }, '超過 2 MB'],
      [{ size: 0 }, '0 bytes'],
      [{ size: 10.5 }, '不是整數的大小'],
    ] as const) {
      await assert.rejects(createUpload(pool, { s3, bucket }, input(over)), UploadRejectedError, `${what} 要丟 UploadRejectedError`)
    }
    const after = (await pool.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n
    assert.equal(after, before, '被拒絕的申請不能寫入 receipts：先檢查，再寫資料庫')
    s3.destroy()
  })
})
