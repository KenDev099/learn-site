// 假的資料庫連線池：行為模仿 pg 的 Pool，不用改這個檔案
// end() 之後再 query 會丟出和 pg 一樣的錯誤
import { setTimeout as sleep } from 'node:timers/promises'

export function createPool() {
  let ended = false
  return {
    async query(sql: string) {
      if (ended) throw new Error('Cannot use a pool after calling end on the pool')
      await sleep(5)
      return { rows: [{ sql, ok: true }] }
    },
    async end() {
      ended = true
      await sleep(20)   // 真的 pool 要等每條連線跟資料庫道別
      console.log(JSON.stringify({ msg: 'pool closed' }))
    },
  }
}
