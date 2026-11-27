// 練習 3：完成一輪工具呼叫（先做完練習 1、2，這裡會用到 orderTools 和 runTools）
import type Anthropic from '@anthropic-ai/sdk'
import type { MenuItem } from '../../helpers/coffee.ts'
import { GetOrderStatusInput, orderTools } from './ex1.ts'
import { runTools } from './ex2.ts'
import { readAnswer } from './read-answer.ts'

export const MODEL = 'claude-opus-5-5'
export const SYSTEM = '你是咖啡店的客服，用繁體中文回答，一兩句就好。訂單狀態與菜單一律用工具查，不要猜；工具回報錯誤時，照實告訴顧客。'

export type OrderStatus = {
  id: number
  status: 'preparing' | 'ready' | 'picked_up'   // 製作中、可以取餐、已取餐
  items: string[]
  orderedAt: string
}

export type Deps = {
  findOrder(id: number): Promise<OrderStatus | null>   // 查資料庫；找不到回傳 null，資料庫出錯會丟錯
  menu: MenuItem[]
}

// 1. 送出帶 orderTools 的請求（model、max_tokens 16000、system、一則 user 訊息）
// 2. stop_reason 不是 tool_use：用 readAnswer 讀出回答（截斷、拒答會丟錯）
// 3. stop_reason 是 tool_use：用 runTools 執行工具
//      get_order_status：先用 GetOrderStatusInput 驗證 input，不合法就不要查資料庫；找不到訂單也算錯誤
//      get_menu：回傳 deps.menu
//    再送一次：messages 依序是 user、assistant（第一次回應的完整 content）、user（全部的 tool_result 放在同一則）
// 4. 用 readAnswer 讀出第二次的回答。這題只處理一輪工具：第二次又是 tool_use 時，readAnswer 會丟錯（第 7 課做成迴圈）
export async function askWithTools(client: Anthropic, question: string, deps: Deps): Promise<string> {
  throw new Error('TODO')
}
