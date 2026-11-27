// 已經寫好，不用改：這一課的練習共用的型別與函式
// readAnswer 與兩個錯誤類別抄自第 2 課練習 2，runTool／runTools 是第 6 課練習 2 的做法
import type Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'

// 一個工具的實作：收到模型給的 input（不可信，要自己驗證），回傳要交給模型的結果；丟錯代表工具失敗
export type Handler = (input: unknown) => unknown | Promise<unknown>
// 一組工具：definitions 放進請求的 tools，handlers 依工具名稱找到實作
export type ToolSet = { definitions: Anthropic.Tool[]; handlers: Record<string, Handler> }

export class TruncatedError extends Error {
  partial: string
  reason: 'max_tokens' | 'model_context_window_exceeded'
  constructor(partial: string, reason: 'max_tokens' | 'model_context_window_exceeded') {
    super(`回答被截斷（stop_reason: ${reason}）`)
    this.name = 'TruncatedError'
    this.partial = partial
    this.reason = reason
  }
}

export class RefusalError extends Error {
  category: Anthropic.RefusalStopDetails['category']
  constructor(category: Anthropic.RefusalStopDetails['category']) {
    super(`模型拒答（category: ${category ?? '無'}）`)
    this.name = 'RefusalError'
    this.category = category
  }
}

// end_turn、stop_sequence 回傳文字；截斷、拒答、tool_use、pause_turn… 一律丟錯
export function readAnswer(message: Anthropic.Message): string {
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
  switch (message.stop_reason) {
    case 'end_turn':
    case 'stop_sequence':
      return text
    case 'max_tokens':
    case 'model_context_window_exceeded':
      throw new TruncatedError(text, message.stop_reason)
    case 'refusal':
      throw new RefusalError(message.stop_details?.category ?? null)
    default:
      throw new Error(`沒有處理的 stop_reason：${message.stop_reason}`)
  }
}

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

// 回應裡全部的 tool_use 平行執行，結果的順序跟 tool_use 一樣；全部放進同一則 user 訊息送回去
export function toolUses(content: Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] {
  return content.filter(block => block.type === 'tool_use')
}
export function runTools(content: Anthropic.ContentBlock[], handlers: Record<string, Handler>): Promise<Anthropic.ToolResultBlockParam[]> {
  return Promise.all(toolUses(content).map(block => runTool(block, handlers)))
}
