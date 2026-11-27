import type { OpenAPIObject } from '@nestjs/swagger'

// endpoint 寫成「方法大寫 + 空白 + 路徑」，例如 'GET /v1/menu'
// field 是欄位路徑：物件用 . 接起來，陣列的元素寫成 []，例如 'items[].qty'；回應本身是陣列時是 '[].price'
export type Finding =
  | { kind: 'endpoint-removed', endpoint: string }
  | { kind: 'response-field-removed', endpoint: string, field: string }
  | { kind: 'request-field-required', endpoint: string, field: string }
  | { kind: 'type-changed', endpoint: string, in: 'request' | 'response', field: string, from: string, to: string }

// 練習 4：比較新舊兩份 OpenAPI 文件，找出會讓現有客戶端壞掉的變更。順序不重要
export function findBreakingChanges(oldDoc: OpenAPIObject, newDoc: OpenAPIObject): Finding[] {
  return []
}
