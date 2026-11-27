// cafe-api v2：過渡版本。寫入時兩欄都寫，讀取時優先讀 mobile，還沒回填的列退回去讀 phone。不要改這個檔
import type { Pool } from 'pg'

export async function addCustomer(db: Pool, name: string, phone: string): Promise<number> {
  const { rows } = await db.query('INSERT INTO customers (name, phone, mobile) VALUES ($1, $2, $2) RETURNING id', [name, phone])
  return Number(rows[0].id)
}

export async function getPhone(db: Pool, id: number): Promise<string | null> {
  const { rows } = await db.query('SELECT coalesce(mobile, phone) AS phone FROM customers WHERE id = $1', [id])
  return rows[0]?.phone ?? null
}
