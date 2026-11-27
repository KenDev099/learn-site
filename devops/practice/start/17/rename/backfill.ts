// 練習 2：把 phone 分批補到 mobile。執行：DATABASE_URL=postgres://… BATCH_SIZE=100 node backfill.ts
// 要求：每批最多 BATCH_SIZE 列、每批自己一個交易、每批印一行進度、批次之間休息一下、
//       中斷後重跑能接著做（已經補好的列不要再更新一次）、只回填到開始時的最大 id（線上一直有新顧客）、做完以 exit 0 結束
import pg from 'pg'

console.error('backfill.ts 還沒寫')
process.exit(1)
