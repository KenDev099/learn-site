// 每日對帳（會計要的，PR-60 一起加的）：昨天（台北時間）的每一筆付款，向 CafePay 查一次，列出狀態或金額對不起來的
//   npm run daily-check                   查昨天
//   npm run daily-check -- 2026-11-09     查指定的日期
// 只列出差異，不改資料：差異由人確認後處理
// 連線用 DATABASE_URL、CAFEPAY_URL（api/.env；已經設定的環境變數優先）
import { CafePay } from '#cafepay-sdk-v1'
import pg from 'pg'

process.loadEnvFile(new URL('../api/.env', import.meta.url))

const day = process.argv[2] ?? new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
const cafepay = new CafePay({ baseUrl: process.env.CAFEPAY_URL ?? 'http://localhost:3190' })
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  const { rows } = await db.query(`SELECT order_id, status, amount FROM payments
    WHERE created_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Taipei'
      AND created_at < ($1::date + 1)::timestamp AT TIME ZONE 'Asia/Taipei'
    ORDER BY order_id`, [day])
  const diffs = []
  for (const p of rows) {
    const r = await cafepay.findPayment(p.order_id)
    if (!r.ok) {
      if (p.status === 'paid') diffs.push({ orderId: p.order_id, ours: p.status, cafepay: r.error.type })
      continue
    }
    const theirs = r.payment.status === 'succeeded' ? 'paid' : 'failed'
    if (theirs !== p.status || r.payment.amount !== p.amount) {
      diffs.push({ orderId: p.order_id, ours: `${p.status} ${p.amount} 元`, cafepay: `${r.payment.status} ${r.payment.amount} 元` })
    }
  }
  console.log(`${day}：${rows.length} 筆付款，${diffs.length} 筆對不起來`)
  if (diffs.length) console.table(diffs)
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await db.end()
}
