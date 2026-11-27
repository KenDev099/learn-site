// 已經寫好，不用改：這一課的練習共用的型別與函式
// Handler、ToolSet、runTool 抄自第 7 課練習的 tools.ts（第 6 課練習 2 的做法）
import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'

// 一個工具的實作：收到模型給的 input（不可信，要自己驗證），回傳要交給模型的結果；丟錯代表工具失敗
export type Handler = (input: unknown) => unknown | Promise<unknown>
// 一組工具：definitions 放進請求的 tools，handlers 依工具名稱找到實作
export type ToolSet = { definitions: Anthropic.Tool[]; handlers: Record<string, Handler> }

// 執行一個 tool_use：找不到工具、handler 丟錯，都變成 is_error: true 的 tool_result，不會丟出例外
export async function runTool(block: Anthropic.ToolUseBlock, handlers: Record<string, Handler>): Promise<Anthropic.ToolResultBlockParam> {
  const handler = Object.hasOwn(handlers, block.name) ? handlers[block.name] : undefined
  if (!handler) return { type: 'tool_result', tool_use_id: block.id, content: `沒有這個工具：${block.name}`, is_error: true }
  try {
    const out = await handler(block.input)
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) }
  } catch (err) {
    return { type: 'tool_result', tool_use_id: block.id, content: err instanceof Error ? err.message : String(err), is_error: true }
  }
}
