// 練習 3：在寫出 log 之前遮蔽敏感資料
// 要求（看課程頁的練習 3）：
// - authorization、cookie 標頭、body 的 password、body.payment.card.number 變成 '[REDACTED]'
// - body.email 只留第一個字和網域：ming@cafe.test → m***@cafe.test
// - 其他欄位（request_id、route、user-agent…）照常記
import { pino } from 'pino'

export const log = pino({
  base: { service: 'cafe-api', version: '1.6.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // 路徑要寫完整：標頭在 req.headers 底下，Node 已經把標頭名稱轉成小寫
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.payment.card.number', 'body.email'],
    // censor 是函式時，會收到原本的值和路徑陣列；email 留第一個字和網域，其他一律 [REDACTED]
    remove: true,
    censor: (value, path) => {
      if (path.at(-1) === 'email' && typeof value === 'string' && value.includes('@')) {
        const [name, domain] = value.split('@')
        return `${name[0]}***@${domain}`
      }
      return '[REDACTED]'
    },
  },
})
