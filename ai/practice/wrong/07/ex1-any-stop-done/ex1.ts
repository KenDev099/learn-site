// 練習 1：最小的 agent 迴圈，加上輪數上限
import type Anthropic from '@anthropic-ai/sdk'
import { MODEL, readAnswer, runTools } from './tools.ts'
import type { ToolSet } from './tools.ts'

export type AgentResult =
  | { status: 'done'; text: string; turns: number }
  | { status: 'max_turns'; turns: number }

// 一輪 = 一次 API 請求。stop_reason 是 tool_use 就執行工具、把結果送回去，直到模型給出最終回答
// 最多送 maxTurns 個請求；到了上限就回傳 { status: 'max_turns' }，不丟錯
// 第 maxTurns 輪還要用工具時，不執行那些工具：結果已經送不出去了
// 不是 tool_use 的回應交給 readAnswer（截斷、拒答會丟錯）
export async function runAgent(client: Anthropic, question: string, tools: ToolSet, opts: { maxTurns: number }): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]
  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: tools.definitions,
      messages,
    })
    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason !== 'tool_use') return { status: 'done', text: response.content.filter(b => b.type === 'text').map(b => b.text).join(''), turns: turn }
    if (turn === opts.maxTurns) break
    messages.push({ role: 'user', content: await runTools(response.content, tools.handlers) })
  }
  return { status: 'max_turns', turns: opts.maxTurns }
}
