// 練習 4：記錄每一次工具呼叫的 trace（先做完練習 1，從它的迴圈開始改）
import type Anthropic from '@anthropic-ai/sdk'
import { MODEL, readAnswer, runTool, toolUses } from './tools.ts'
import type { ToolSet } from './tools.ts'

export type TraceEntry = {
  turn: number          // 第幾輪（第幾個請求），從 1 開始
  tool: string          // 工具名稱
  isError: boolean      // tool_result 是不是 is_error
  ms: number            // 這個工具執行了多久：用 now() 量
  inputTokens: number   // 這一輪回應的 usage
  outputTokens: number
}
export type TracedResult =
  | { status: 'done'; text: string; turns: number; trace: TraceEntry[] }
  | { status: 'max_turns'; turns: number; trace: TraceEntry[] }

// 跟練習 1 一樣的迴圈（maxTurns、最後一輪不執行工具），另外：
// 每個執行的工具記一筆 TraceEntry，順序跟 tool_use 一樣；時間只用 opts.now()（不要用 Date.now）
// done 與 max_turns 都要回傳 trace
export async function runTracedAgent(
  client: Anthropic, question: string, tools: ToolSet,
  opts: { maxTurns: number; now: () => number },
): Promise<TracedResult> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }]
  const trace: TraceEntry[] = []
  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: tools.definitions,
      messages,
    })
    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason !== 'tool_use') return { status: 'done', text: readAnswer(response), turns: turn, trace }
    if (turn === opts.maxTurns) break
    const done = await Promise.all(toolUses(response.content).map(async call => {
      const started = Date.now()
      const result = await runTool(call, tools.handlers)
      const entry: TraceEntry = {
        turn, tool: call.name, isError: result.is_error === true, ms: Date.now() - started,
        inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      }
      return { result, entry }
    }))
    trace.push(...done.map(d => d.entry))
    messages.push({ role: 'user', content: done.map(d => d.result) })
  }
  return { status: 'max_turns', turns: opts.maxTurns, trace }
}
