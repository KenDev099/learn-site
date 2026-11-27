// 練習 1：定義工具：get_order_status（查訂單狀態）與 get_menu（查菜單）
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// 已經寫好，不用改：把 zod schema 轉成 strict 工具可以用的 JSON Schema
// strict: true 不支援 minimum、maximum、minLength 這類限制（送了會 400），也不需要 $schema，所以拿掉
// 拿掉的限制不會消失：練習 3 執行工具前，你會用同一個 zod schema 在自己這邊檢查
const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength']
export function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema, ...json } = z.toJSONSchema(schema, {
    override: ({ jsonSchema }) => {
      for (const key of UNSUPPORTED) delete (jsonSchema as Record<string, unknown>)[key]
    },
  })
  return json as Anthropic.Tool.InputSchema
}

// get_order_status 的參數：order_id 是正整數（1、2、3…），用 .describe() 寫給模型看的說明
export const GetOrderStatusInput = z.object({
  order_id: z.number().int().positive().describe('訂單編號，正整數，例如 42。顧客說「42 號」就是 42'),
})

// get_menu 不需要參數
export const GetMenuInput = z.object({})

// 兩個工具：name、description（寫清楚做什麼、什麼時候用、回傳什麼）、input_schema（用 toInputSchema 產生）、strict: true
export const orderTools: Anthropic.Tool[] = [
  {
    name: 'get_order_status',
    description: '查詢一張訂單目前的狀態。顧客問訂單好了沒、做到哪裡、點了什麼時使用；需要訂單編號，顧客沒給編號時先問，不要猜。回傳 id、status（preparing 製作中、ready 可以取餐、picked_up 已取餐）、items、orderedAt。',
    input_schema: toInputSchema(GetOrderStatusInput),
    strict: true,
  },
  {
    name: 'get_menu',
    description: '取得目前販售的完整菜單。顧客問價格、有賣什麼、推薦品項時使用。回傳每個品項的 id、name、price（新台幣元）；不含庫存與營業時間。',
    input_schema: toInputSchema(GetMenuInput),
    strict: true,
  },
]
