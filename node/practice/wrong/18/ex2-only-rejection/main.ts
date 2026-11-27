// 練習 2：程序層級的最後防線
// 執行：BUG=exception node main.ts 或 BUG=rejection node main.ts，伺服器開起來之後排程工作會出錯
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { writeSync } from 'node:fs'
import { buildDailyReport, uploadReport } from './report.ts'

const server = createServer((req, res) => {
  res.end('ok\n')
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})

// 排程工作：JOB_DELAY_MS 毫秒後執行一次。BUG 選擇要發生哪一種 bug（測試用）
setTimeout(() => {
  if (process.env.BUG === 'exception') {
    const total = buildDailyReport([{ drink: '拿鐵', qty: 2, product: { price: 110 } }, { drink: '季節限定', qty: 1 }])
    console.log(JSON.stringify({ msg: 'report', total }))
  }
  if (process.env.BUG === 'rejection') {
    uploadReport(process.env.REPORT_TAG ?? 'daily')   // 忘了 await
  }
}, Number(process.env.JOB_DELAY_MS ?? 1000))

// 程式狀態已經不可信：記一行 log，停止接新請求，以結束碼 1 結束，交給監督者重新啟動
function fatal(origin: string, err: unknown) {
  const line = JSON.stringify({
    level: 'fatal',
    msg: origin,
    errorId: randomUUID(),
    name: Error.isError(err) ? err.name : typeof err,
    message: Error.isError(err) ? err.message : String(err),
    stack: Error.isError(err) ? err.stack : undefined,
  })
  writeSync(2, line + '\n')   // 同步寫進 stderr（fd 2）：接管線時 console.error 是非同步的，下一行結束程序就可能掉
  server.close()
  process.exit(1)
}

process.on('unhandledRejection', reason => fatal('unhandledRejection', reason))
