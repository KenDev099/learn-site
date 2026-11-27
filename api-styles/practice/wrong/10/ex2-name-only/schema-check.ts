// 錯誤：只用欄位「名稱」判斷有沒有人在用，沒管欄位屬於哪個型別（Product.status 會被誤認為 Order.status）
import { BreakingChangeType, buildSchema, findSchemaChanges, isObjectType } from 'graphql'

export type CheckResult = { ok: boolean, breaking: string[], unusedRemovals: string[] }

export function checkSchema(oldSdl: string, newSdl: string, operations: string[]): CheckResult {
  const oldSchema = buildSchema(oldSdl)
  const newSchema = buildSchema(newSdl)
  const text = operations.join('\n')
  const isUsed = (field: string) => new RegExp(`\\b${field}\\b`).test(text)
  const removed: string[] = []
  for (const type of Object.values(oldSchema.getTypeMap())) {
    const next = newSchema.getType(type.name)
    if (isObjectType(type) && isObjectType(next)) {
      for (const name of Object.keys(type.getFields())) if (!(name in next.getFields())) removed.push(`${type.name}.${name}`)
    }
  }
  const unusedRemovals = removed.filter(c => !isUsed(c.split('.')[1])).sort()
  const breaking = [
    ...removed.filter(c => isUsed(c.split('.')[1])).map(c => `${c} 被移除`),
    ...findSchemaChanges(oldSchema, newSchema)
      .filter(c => c.type in BreakingChangeType && c.type !== BreakingChangeType.FIELD_REMOVED)
      .map(c => c.description),
  ]
  return { ok: breaking.length === 0, breaking, unusedRemovals }
}
