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
  // TODO
})

// get_menu 不需要參數
export const GetMenuInput = z.object({})

// 兩個工具：name、description（寫清楚做什麼、什麼時候用、回傳什麼）、input_schema（用 toInputSchema 產生）、strict: true
export const orderTools: Anthropic.Tool[] = []
