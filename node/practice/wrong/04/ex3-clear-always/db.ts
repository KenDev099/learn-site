import { createPool, type Pool } from './pool-factory.ts'

let pending: Promise<Pool> | undefined

export function getPool(): Promise<Pool> {
  // 不管成功或失敗都清掉：同時呼叫的人共用，但建好之後下一次又會重建
  pending ??= createPool().finally(() => { pending = undefined })
  return pending
}
