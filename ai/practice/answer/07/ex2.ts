// 練習 2：迴圈一定會停：輪數、token 預算、重複呼叫偵測（先做完練習 1，從它的迴圈開始改）
import type Anthropic from '@anthropic-ai/sdk'
import { MODEL, readAnswer, runTools, toolUses } from './tools.ts'
import type { ToolSet } from './tools.ts'

export type GuardedResult = {
  status: 'done' | 'max_turns' | 'budget' | 'loop'
  text?: string                                // 只有 done 時有值
  turns: number                                // 送出的請求數
  tokens: { input: number; output: number }    // 全部請求的 usage 加總
}

// 規則（每一輪拿到回應之後，依序檢查）：
// 1. 把這輪的 usage.input_tokens、output_tokens 加進 tokens
// 2. 不是 tool_use：回傳 done（文字用 readAnswer）
// 3. 已經是第 maxTurns 輪：回傳 max_turns
// 4. 累計 input＋output 大於 maxTokens：回傳 budget（剛好等於還可以繼續）
// 5. 這輪的某個工具呼叫（名稱＋JSON.stringify(input)）在這次任務累計出現到第 3 次：回傳 loop
// 2～5 停下來時，這一輪的工具都不執行；都沒停才執行工具、送下一個請求
export async function runGuardedAgent(
  client: Anthropic, question: string, tools: ToolSet,
  opts: { maxTurns: number; maxTokens: number },
): Promise<GuardedResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]
  const tokens = { input: 0, output: 0 }
  const seen = new Map<string, number>()
  for (let turn = 1; ; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: tools.definitions,
      messages,
    })
    tokens.input += response.usage.input_tokens
    tokens.output += response.usage.output_tokens
    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason !== 'tool_use') return { status: 'done', text: readAnswer(response), turns: turn, tokens }
    if (turn >= opts.maxTurns) return { status: 'max_turns', turns: turn, tokens }
    if (tokens.input + tokens.output > opts.maxTokens) return { status: 'budget', turns: turn, tokens }
    for (const call of toolUses(response.content)) {
      const key = `${call.name}:${JSON.stringify(call.input)}`
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      if (count >= 3) return { status: 'loop', turns: turn, tokens }
    }
    messages.push({ role: 'user', content: await runTools(response.content, tools.handlers) })
  }
}
