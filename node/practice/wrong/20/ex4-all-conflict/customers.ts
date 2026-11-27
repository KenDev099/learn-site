// 練習 4：新增顧客，把資料庫錯誤轉成領域錯誤
import type pg from 'pg'
import { ConflictError, DatabaseUnavailableError, ValidationError } from './errors.ts'

export type Customer = { id: number, name: string, phone: string }

// 連不上：Node 的網路錯誤碼，以及 SQLSTATE 08xxx（連線例外）、57P0x（資料庫正在關機、還不能連）
const UNAVAILABLE = /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|08...|57P0.|57014)$/

export async function createCustomer(pool: pg.Pool, input: { name: string, phone: string }): Promise<Customer> {
  try {
    const { rows } = await pool.query<Customer>(
      'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id, name, phone', [input.name, input.phone])
    return rows[0]
  } catch (err) {
    throw new ConflictError("這支手機已經註冊過", "phone", { cause: err })
  }
}
