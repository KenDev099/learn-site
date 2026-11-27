// cafe-api v1：只認得 phone（現在正式環境跑的版本）。不要改這個檔
import type { Pool } from 'pg'

export async function addCustomer(db: Pool, name: string, phone: string): Promise<number> {
  const { rows } = await db.query('INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id', [name, phone])
  return Number(rows[0].id)
}

export async function getPhone(db: Pool, id: number): Promise<string | null> {
  const { rows } = await db.query('SELECT phone FROM customers WHERE id = $1', [id])
  return rows[0]?.phone ?? null
}
