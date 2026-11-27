// 練習 2：CI 用的 schema 檢查。oldSdl 是 main 分支的 schema，newSdl 是這個 PR 的，operations 是前端實際在用的查詢文件
// 回傳：
//   unusedRemovals：被移除、但沒有任何操作用到的欄位座標（'Type.field'），排序後回傳；不讓 ok 變 false
//   breaking：其他破壞性變更（被移除且有人在用的欄位、改型別、參數改必填…），每項一個字串，要帶出 'Type.field'
//   ok：breaking 是空的
import {
  BreakingChangeType, TypeInfo, buildSchema, findSchemaChanges, isInputObjectType, isInterfaceType, isObjectType,
  parse, visit, visitWithTypeInfo,
} from 'graphql'

export type CheckResult = { ok: boolean, breaking: string[], unusedRemovals: string[] }

const SAFE = new Set<string>(['DESCRIPTION_CHANGED', 'TYPE_ADDED', 'FIELD_ADDED', 'FIELD_CHANGED_KIND_SAFE', 'ARG_CHANGED_KIND_SAFE', 'DIRECTIVE_ADDED'])
const BREAKING = new Set<string>(Object.values(BreakingChangeType))

export function checkSchema(oldSdl: string, newSdl: string, operations: string[]): CheckResult {
  const oldSchema = buildSchema(oldSdl)
  const newSchema = buildSchema(newSdl)

  // 1. 操作用到哪些欄位：TypeInfo 在走訪時告訴我們「現在這個欄位屬於哪個型別」；fragment 定義也在文件裡，一起走到
  const used = new Set<string>()
  const typeInfo = new TypeInfo(oldSchema)
  for (const source of operations) {
    visit(parse(source), visitWithTypeInfo(typeInfo, {
      Field() {
        const parent = typeInfo.getParentType()
        const field = typeInfo.getFieldDef()
        if (parent && field) used.add(`${parent.name}.${field.name}`)
      },
    }))
  }

  // 2. 被移除的欄位：舊 schema 有、新 schema 的同名型別沒有（整個型別被刪由 TYPE_REMOVED 報）
  const removedOutput: string[] = []
  const removedInput: string[] = []
  for (const type of Object.values(oldSchema.getTypeMap())) {
    const next = newSchema.getType(type.name)
    if ((isObjectType(type) || isInterfaceType(type)) && (isObjectType(next) || isInterfaceType(next))) {
      for (const name of Object.keys(type.getFields())) if (!(name in next.getFields())) removedOutput.push(`${type.name}.${name}`)
    }
    // input 欄位的使用藏在 variables 的 JSON 裡，從操作看不出來：一律當成破壞性
    if (isInputObjectType(type) && isInputObjectType(next)) {
      for (const name of Object.keys(type.getFields())) if (!(name in next.getFields())) removedInput.push(`${type.name}.${name}`)
    }
  }

  const unusedRemovals = removedOutput.filter(c => !used.has(c)).sort()
  const breaking = [
    ...removedOutput.filter(c => used.has(c)).map(c => `${c} 被移除，但還有操作在用`),
    ...removedInput.map(c => `${c}（input 欄位）被移除`),
    // 欄位移除上面已經自己算過，這裡跳過 FIELD_REMOVED；DANGEROUS、SAFE 不擋
    ...findSchemaChanges(oldSchema, newSchema)
      .filter(c => !SAFE.has(c.type) && c.type !== BreakingChangeType.FIELD_REMOVED)
      .map(c => c.description),
  ]
  return { ok: breaking.length === 0, breaking, unusedRemovals }
}
