// 練習 3：整個程式共用一個連線池
import { createPool, type Pool } from './pool-factory.ts'

// 快取「進行中的 Promise」而不是結果：同時呼叫的人都拿到同一個 Promise，只建立一次
let pending: Promise<Pool> | undefined

export function getPool(): Promise<Pool> {
  pending ??= createPool().catch(err => {
    pending = undefined   // 失敗的不要留著，下一次呼叫重新建立
    throw err
  })
  return pending
}
