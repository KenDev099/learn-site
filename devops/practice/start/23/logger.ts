// 練習 3：讓請求期間的每一行 log 都帶上目前的 trace_id 與 span_id（先完成練習 2）
// 要求（看課程頁的練習 3）：請求以外的 log（例如啟動訊息）不帶這兩個欄位
import { pino } from 'pino'

export function createLogger(service: string) {
  return pino({
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}
