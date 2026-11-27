// 練習 2：執行模型要求的工具，把結果做成 tool_result
import type Anthropic from '@anthropic-ai/sdk'

export type ToolHandler = (input: unknown) => Promise<unknown>

// content 是模型回應的完整 content（可能有 thinking、text、好幾個 tool_use）
// 每個 tool_use block 都要產生一個 tool_result，順序跟 tool_use 一樣：
//   - 用 block.name 找 handler，把 block.input 傳進去；全部的 handler 同時開始執行（平行）
//   - 成功：content 是 JSON.stringify(handler 的回傳值)
//   - 找不到工具、handler 丟錯：is_error: true，content 是一句說明（包含工具名稱或錯誤訊息）
//   - 不論哪個工具失敗，runTools 都不丟錯，其他工具的結果照常回傳
export async function runTools(content: Anthropic.ContentBlock[], handlers: Record<string, ToolHandler>): Promise<Anthropic.ToolResultBlockParam[]> {
  throw new Error('TODO')
}
