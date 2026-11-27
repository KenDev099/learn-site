// 練習 1：最小的 agent 迴圈，加上輪數上限
import type Anthropic from '@anthropic-ai/sdk'
// 用得到的都在 tools.ts：MODEL、readAnswer、runTools
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
  throw new Error('TODO')
}
