// 練習 3：整個程式共用一個連線池
// 現在每次呼叫 getPool() 都建立一個新的，改成只建立一次
import { createPool, type Pool } from './pool-factory.ts'

export function getPool(): Promise<Pool> {
  return createPool()
}
