import { createPool, type Pool } from './pool-factory.ts'

let pool: Pool | undefined

export async function getPool(): Promise<Pool> {
  if (!pool) pool = await createPool()   // 等建好才存：同時呼叫的人都看到 undefined
  return pool
}
