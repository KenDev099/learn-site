// 練習 3 的進入點：不用改這個檔案，改 start.ts
// 執行：FAIL_TIMES=3 node main.ts（前 3 次連不上資料庫），FAIL_TIMES=99 node main.ts（一直連不上）
import { createServer } from 'node:http'
import { writeSync } from 'node:fs'
import { start } from './start.ts'

const failTimes = Number(process.env.FAIL_TIMES ?? 0)
const t0 = performance.now()
let attempt = 0

// 在 stdout 記一行帶時間（程序啟動後幾毫秒）的 log，測試靠它檢查重試的間隔
// 用 writeSync 直接寫出：就算之後馬上 process.exit，這一行也不會掉
const mark = (data: object) => writeSync(1, JSON.stringify({ ...data, t: Math.round(performance.now() - t0) }) + '\n')
process.on('exit', code => mark({ msg: 'exit', code }))

// 假的資料庫檢查：前 failTimes 次失敗
async function checkDb() {
  attempt++
  if (attempt > 20) {   // 測試用的保險：無限重試時不要一直跑下去
    console.error('checkDb 被呼叫超過 20 次：重試要有次數上限')
    process.exit(2)
  }
  const ok = attempt > failTimes
  mark({ msg: 'checkDb', attempt, ok })
  if (!ok) throw new Error(`connect ECONNREFUSED 127.0.0.1:54329（第 ${attempt} 次${process.env.TAG ? '，' + process.env.TAG : ''}）`)
}

const server = createServer((req, res) => {
  res.end('ok\n')
})

function listen() {
  return new Promise<void>(resolve => {
    server.listen(Number(process.env.PORT ?? 3000), () => {
      const { port } = server.address() as { port: number }
      mark({ msg: 'listening', port })
      resolve()
    })
  })
}

await start({ checkDb, listen })
