import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { usePg } from '../../helpers/pg.ts'
import { useS3 } from '../../helpers/s3.ts'
import { createTables, MAX_SIZE, ObjectMissingError, ReceiptNotFoundError } from './receipts.ts'
import { confirmUpload } from './confirm.ts'

const pool = usePg(12)
const { s3, bucket } = useS3(12, 'receipts')

// 記錄送給 S3 的指令名稱
function watched(client: S3Client, calls: string[]): S3Client {
  return new Proxy(client, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (prop !== 'send') return typeof v === 'function' ? v.bind(target) : v
      return (cmd: object, ...rest: unknown[]) => { calls.push(cmd.constructor.name); return (v as Function).call(target, cmd, ...rest) }
    },
  })
}
// 新增一筆 pending 紀錄（前端申報的大小一律寫 1000），uploaded 不為 null 時照實上傳物件
async function pending(orderId: number, key: string, uploaded: { body: Uint8Array; type: string } | null) {
  const { rows } = await pool.query(
    `INSERT INTO receipts (order_id, s3_key, content_type, size, created_at) VALUES ($1, $2, 'application/pdf', 1000, now()) RETURNING id`, [orderId, key])
  if (uploaded) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: uploaded.body, ContentType: uploaded.type }))
  return rows[0].id as number
}
const row = async (id: number) => (await pool.query('SELECT status, size, uploaded_at FROM receipts WHERE id = $1', [id])).rows[0]
const exists = async (key: string) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(() => true, () => false)

describe('練習 2：伺服器確認上傳（confirmUpload）', { timeout: 120_000 }, () => {
  // 建表放在 describe 裡的 before：檔案最上層的 before 會跟 usePg、useS3 的準備同時執行
  before(async () => {
    await createTables(pool)
    await pool.query('INSERT INTO orders (id, customer_id) VALUES (15, 21), (16, 22), (17, 23)')
  })

  test('正常的 PDF：狀態改成 uploaded，size 改成實際大小', async () => {
    const body = new Uint8Array(4321)
    const id = await pending(15, 'receipts/2026/11/ok-15.pdf', { body, type: 'application/pdf' })
    assert.equal(await confirmUpload(pool, { s3, bucket }, id), 'uploaded')
    const r = await row(id)
    assert.equal(r.status, 'uploaded', '資料庫的狀態要改成 uploaded')
    assert.equal(r.size, 4321, `size 要改成 HeadObject 的 ContentLength（4321），實際 ${r.size}：前端申報的大小不可信`)
    assert.ok(r.uploaded_at, 'uploaded_at 要填上')
    assert.ok(await exists('receipts/2026/11/ok-15.pdf'), '正常的檔案不能被刪')
  })

  test('實際上傳了 3 MB（申報的是 1000 bytes）：刪除物件、標記 rejected', async () => {
    const id = await pending(16, 'receipts/2026/11/big-16.pdf', { body: new Uint8Array(3 * 1024 * 1024), type: 'application/pdf' })
    assert.equal(await confirmUpload(pool, { s3, bucket }, id), 'rejected', `3 MB 超過 ${MAX_SIZE} bytes：要用 HeadObject 的實際大小判斷，不是紀錄裡申報的 size`)
    assert.equal((await row(id)).status, 'rejected', '資料庫的狀態要改成 rejected')
    assert.equal(await exists('receipts/2026/11/big-16.pdf'), false, '驗證失敗的物件要刪掉，不然它會一直佔空間，也可能被拿來散布')
  })

  test('Content-Type 不對（text/html）：刪除物件、標記 rejected', async () => {
    const id = await pending(17, 'receipts/2026/11/html-17.pdf', { body: new TextEncoder().encode('<script>alert(1)</script>'), type: 'text/html' })
    assert.equal(await confirmUpload(pool, { s3, bucket }, id), 'rejected', '物件的 ContentType 跟紀錄的 content_type 不同，要判為 rejected')
    assert.equal((await row(id)).status, 'rejected')
    assert.equal(await exists('receipts/2026/11/html-17.pdf'), false, '驗證失敗的物件要刪掉')
  })

  test('物件還沒上傳：丟 ObjectMissingError，紀錄維持 pending；沒有這筆紀錄：丟 ReceiptNotFoundError', async () => {
    const id = await pending(15, 'receipts/2026/11/missing-15.pdf', null)
    await assert.rejects(confirmUpload(pool, { s3, bucket }, id), ObjectMissingError, 'HeadObject 回 NotFound 時要丟 ObjectMissingError')
    assert.equal((await row(id)).status, 'pending', '物件不存在時不要改狀態，前端可能還在上傳')
    await assert.rejects(confirmUpload(pool, { s3, bucket }, 99_999), ReceiptNotFoundError, '沒有這筆收據要丟 ReceiptNotFoundError')
  })

  test('重複呼叫：回傳同樣的結果，不再呼叫 S3', async () => {
    const ok = await pending(15, 'receipts/2026/11/again-15.pdf', { body: new Uint8Array(100), type: 'application/pdf' })
    const bad = await pending(16, 'receipts/2026/11/again-16.pdf', { body: new Uint8Array(100), type: 'image/png' })
    assert.equal(await confirmUpload(pool, { s3, bucket }, ok), 'uploaded')
    assert.equal(await confirmUpload(pool, { s3, bucket }, bad), 'rejected')
    const first = (await row(ok)).uploaded_at
    const calls: string[] = []
    const store = { s3: watched(s3, calls), bucket }
    assert.equal(await confirmUpload(pool, store, ok), 'uploaded', '已經 uploaded 的再確認一次，要回傳 uploaded')
    assert.equal(await confirmUpload(pool, store, bad), 'rejected', '已經 rejected 的再確認一次，要回傳 rejected（物件已經刪了，不能再去 HeadObject）')
    assert.deepEqual(calls, [], `已經處理過的收據不能再呼叫 S3，實際呼叫了：${calls.join('、')}`)
    assert.deepEqual((await row(ok)).uploaded_at, first, 'uploaded_at 被改掉了：處理過的就不要再更新')
  })
})
