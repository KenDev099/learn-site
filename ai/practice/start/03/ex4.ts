// 練習 4：量首字延遲（TTFT）與總時間
import type Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

// 用 now() 計時（不要用 Date.now()／performance.now()，測試會傳入假的時鐘）
// - ttftMs：從送出請求前到收到第一段文字（text delta）的毫秒數；整個回應都沒有文字時是 null
// - totalMs：從送出請求前到串流結束（finalMessage 完成）的毫秒數
// - outputTokens：最終 usage 的 output_tokens
export async function measure(client: Anthropic, question: string, now: () => number): Promise<{ ttftMs: number | null; totalMs: number; outputTokens: number }> {
  throw new Error('TODO')
}
