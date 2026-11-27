import { createPool, type Pool } from './pool-factory.ts'

let pending: Promise<Pool> | undefined

export function getPool(): Promise<Pool> {
  pending ??= createPool()   // 失敗的 Promise 也一直留著
  return pending
}
