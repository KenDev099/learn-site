// 練習 3：在寫出 log 之前遮蔽敏感資料
// 要求（看課程頁的練習 3）：
// - authorization、cookie 標頭、body 的 password、body.payment.card.number 變成 '[REDACTED]'
// - body.email 只留第一個字和網域：ming@cafe.test → m***@cafe.test
// - 其他欄位（request_id、route、user-agent…）照常記
import { pino } from 'pino'

export const log = pino({
  base: { service: 'cafe-api', version: '1.6.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
})
