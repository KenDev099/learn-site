import { createPool, type Pool } from './pool-factory.ts'

const pool = await createPool()   // import 的時候就建立：失敗了整個模組都壞掉

export async function getPool(): Promise<Pool> {
  return pool
}
