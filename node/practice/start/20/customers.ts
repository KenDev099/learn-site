// 練習 4：新增顧客，把資料庫錯誤轉成領域錯誤
import type pg from 'pg'
import { ConflictError, DatabaseUnavailableError, ValidationError } from './errors.ts'

export type Customer = { id: number, name: string, phone: string }

// TODO：用 err.code（SQLSTATE 或 Node 的錯誤碼）判斷，不要看 err.message
// - 23505 且是 customers_phone_key → ConflictError（field 'phone'）
// - 23514（CHECK）→ ValidationError（field 'name'）
// - 連不上資料庫（ECONNREFUSED 等）或查詢逾時（57014）→ DatabaseUnavailableError
// - 其他錯誤原樣丟出去
// 轉換時都要把原本的錯誤放在 cause
export async function createCustomer(pool: pg.Pool, input: { name: string, phone: string }): Promise<Customer> {
  try {
    const { rows } = await pool.query<Customer>(
      'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id, name, phone', [input.name, input.phone])
    return rows[0]
  } catch (err) {
    throw new ConflictError('這支手機已經註冊過', 'phone')
  }
}
