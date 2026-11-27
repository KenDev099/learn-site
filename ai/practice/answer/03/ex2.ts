// 練習 2：使用者離開時中斷串流
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5-5'

// 跟練習 1 一樣串流回答並呼叫 onDelta，另外：
// - signal 觸發時，要讓上游的請求跟著中斷（連線關掉，不再產生、不再計費）
// - 中斷時不丟錯，回傳 { status: 'aborted', partial: 到中斷為止收到的文字 }
// - 正常結束回傳 { status: 'done', partial: 完整的文字 }
// - 其他錯誤（例如 API 錯誤）照樣往外丟
export async function streamWithAbort(client: Anthropic, question: string, signal: AbortSignal, onDelta: (text: string) => void): Promise<{ status: 'done' | 'aborted'; partial: string }> {
  let partial = ''
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: question }],
  }, { signal })
  stream.on('text', delta => {
    partial += delta
    onDelta(delta)
  })
  try {
    await stream.finalMessage()
    return { status: 'done', partial }
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return { status: 'aborted', partial }
    throw err
  }
}
