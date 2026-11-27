// 練習 1：用串流取得回答，每收到一段文字就交給 onDelta
import type Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

// 用 client.messages.stream 送出一則 user 訊息（max_tokens 16000）
// 每收到一段新文字（text delta）就依序呼叫 onDelta；結束後回傳所有 text block 接起來的文字與最終的 usage
export async function streamAnswer(client: Anthropic, question: string, onDelta: (text: string) => void): Promise<{ text: string; usage: Anthropic.Usage }> {
  throw new Error('TODO')
}
