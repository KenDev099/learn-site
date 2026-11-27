// 練習 3：查詢成本（cost）。這門課的定義（頁面上的表格就是用這個規則算的）：
// - 每個欄位 1 分（包括 __typename）
// - 有 first 參數的欄位會回傳一串資料：「這個欄位自己 1 分＋底下所有欄位」整個乘以 first
//   first 可以寫在查詢裡（first: 50）、用變數（first: $n），或不寫（用 schema 的預設值，例如 first: Int = 10）
// - 巢狀相乘；別名算不同欄位（各算各的）；fragment 與 inline fragment 要展開來算
// 超過 max：回報 GraphQLError，extensions 是 { code: 'QUERY_TOO_COMPLEX', cost: 算出來的成本 }，訊息裡要有成本
import {
  GraphQLError, Kind, getArgumentValues, getNamedType, getVariableValues, isInterfaceType, isObjectType,
  type GraphQLField, type GraphQLNamedType, type FieldNode, type SelectionSetNode, type ValidationContext, type ValidationRule,
} from 'graphql'

type VariableValues = NonNullable<Parameters<typeof getArgumentValues>[2]>

// 給好的小工具：這個欄位的 first 是多少（沒有 first 參數的欄位回傳 1）。
// variableValues 是 getVariableValues(schema, op.variableDefinitions, variables) 回傳的 variableValues；
// 沒有傳 variableValues 時，用到變數的 first 會被當成 schema 的預設值
export function listSize(def: GraphQLField<unknown, unknown>, node: FieldNode, variableValues?: VariableValues): number {
  if (!def.args.some(arg => arg.name === 'first')) return 1
  let first: unknown
  try { first = getArgumentValues(def, node, variableValues).first } catch { first = getArgumentValues(def, { ...node, arguments: [] }).first }
  // 負數當 0：不然 first: -100000 可以把成本扣成負的
  return typeof first === 'number' ? Math.max(first, 0) : 1
}

// 某個型別上的欄位定義；找不到（例如 __typename）回傳 undefined
export function fieldDef(type: GraphQLNamedType, name: string) {
  return isObjectType(type) || isInterfaceType(type) ? type.getFields()[name] : undefined
}

export function costLimitRule(max: number, variables: Record<string, unknown> = {}): ValidationRule {
  return (context: ValidationContext) => ({
    OperationDefinition(op) {
      const root = context.getSchema().getRootType(op.operation)
      if (!root) return
      const cost = selectionCost(op.selectionSet, root)
      if (cost > max) {
        context.reportError(new GraphQLError(`查詢成本 ${cost} 超過上限 ${max}`, { nodes: op, extensions: { code: 'QUERY_TOO_COMPLEX', cost } }))
      }
    },
  })
}

// ✗ 只數欄位個數：沒有乘上 first、沒有展開 fragment、沒有用到 variables。
// 提示：把這個函式搬進 OperationDefinition 裡面，才拿得到 schema、context.getFragment(名稱) 和 variableValues；
// 三種 selection：Kind.FIELD、Kind.INLINE_FRAGMENT、Kind.FRAGMENT_SPREAD
function selectionCost(set: SelectionSetNode, type: GraphQLNamedType): number {
  let total = 0
  for (const selection of set.selections) {
    if (selection.kind !== Kind.FIELD) continue
    const def = fieldDef(type, selection.name.value)
    const children = selection.selectionSet && def ? selectionCost(selection.selectionSet, getNamedType(def.type)) : 0
    total += 1 + children
  }
  return total
}
