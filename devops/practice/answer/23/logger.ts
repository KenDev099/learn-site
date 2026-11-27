// 練習 3：讓請求期間的每一行 log 都帶上目前的 trace_id 與 span_id（先完成練習 2）
// 要求（看課程頁的練習 3）：請求以外的 log（例如啟動訊息）不帶這兩個欄位
import { trace } from '@opentelemetry/api'
import { pino } from 'pino'

export function createLogger(service: string) {
  return pino({
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    // 每寫一行 log 都會呼叫：從 AsyncLocalStorage 取出「這個請求」目前的 span，不是全域變數
    mixin() {
      const span = trace.getActiveSpan()
      if (!span) return {}
      const { traceId, spanId } = span.spanContext()
      return { trace_id: traceId, span_id: spanId }
    },
  })
}
