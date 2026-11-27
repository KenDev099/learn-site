import type { OpenAPIObject, ReferenceObject, SchemaObject } from '@nestjs/swagger'

// endpoint 寫成「方法大寫 + 空白 + 路徑」，例如 'GET /v1/menu'
// field 是欄位路徑：物件用 . 接起來，陣列的元素寫成 []，例如 'items[].qty'；回應本身是陣列時是 '[].price'
export type Finding =
  | { kind: 'endpoint-removed', endpoint: string }
  | { kind: 'response-field-removed', endpoint: string, field: string }
  | { kind: 'request-field-required', endpoint: string, field: string }
  | { kind: 'type-changed', endpoint: string, in: 'request' | 'response', field: string, from: string, to: string }

type Schema = SchemaObject | ReferenceObject | undefined
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const

// '#/components/schemas/OrderItemDto' → 文件裡的那一份 schema；可能連續好幾層 $ref
function resolve(doc: OpenAPIObject, schema: Schema): SchemaObject | undefined {
  while (schema && '$ref' in schema) {
    const name = schema.$ref.replace('#/components/schemas/', '')
    const found = doc.components?.schemas?.[name]
    Object.assign(schema, found)   // 把解析結果寫回原本的物件
    delete (schema as { $ref?: string }).$ref
  }
  return schema as SchemaObject | undefined
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key)

export function findBreakingChanges(oldDoc: OpenAPIObject, newDoc: OpenAPIObject): Finding[] {
  const findings: Finding[] = []

  // 回應：舊的欄位都要還在、型別不變。新增的欄位不用看
  function compareResponse(endpoint: string, oldS: Schema, newS: Schema, field: string) {
    const o = resolve(oldDoc, oldS), n = resolve(newDoc, newS)
    if (!o || !n) return
    if (o.type && n.type && o.type !== n.type) {
      findings.push({ kind: 'type-changed', endpoint, in: 'response', field, from: String(o.type), to: String(n.type) })
      return
    }
    if (o.type === 'array') return compareResponse(endpoint, o.items, n.items, `${field}[]`)
    for (const [key, sub] of Object.entries(o.properties ?? {})) {
      const next = n.properties?.[key]
      if (!next) findings.push({ kind: 'response-field-removed', endpoint, field: join(field, key) })
      else compareResponse(endpoint, sub, next, join(field, key))
    }
  }

  // 請求：新文件裡的必填欄位，舊文件要已經是必填；兩邊都有的欄位型別不能變
  function compareRequest(endpoint: string, oldS: Schema, newS: Schema, field: string) {
    const o = resolve(oldDoc, oldS), n = resolve(newDoc, newS)
    if (!n) return
    if (o?.type && n.type && o.type !== n.type) {
      findings.push({ kind: 'type-changed', endpoint, in: 'request', field, from: String(o.type), to: String(n.type) })
      return
    }
    if (n.type === 'array') return compareRequest(endpoint, o?.items, n.items, `${field}[]`)
    for (const [key, sub] of Object.entries(n.properties ?? {})) {
      const before = o?.properties?.[key]
      const wasRequired = before !== undefined && (o?.required ?? []).includes(key)
      if ((n.required ?? []).includes(key) && !wasRequired) findings.push({ kind: 'request-field-required', endpoint, field: join(field, key) })
      else if (before) compareRequest(endpoint, before, sub, join(field, key))
    }
  }

  for (const [path, oldItem] of Object.entries(oldDoc.paths)) {
    for (const method of METHODS) {
      const oldOp = oldItem[method]
      if (!oldOp) continue
      const endpoint = `${method.toUpperCase()} ${path}`
      const newOp = newDoc.paths[path]?.[method]
      if (!newOp) {
        findings.push({ kind: 'endpoint-removed', endpoint })
        continue
      }
      // 只比對新舊都有的 2xx 回應
      for (const [status, oldRes] of Object.entries(oldOp.responses ?? {})) {
        const newRes = newOp.responses?.[status]
        if (!status.startsWith('2') || !oldRes || !newRes || '$ref' in oldRes || '$ref' in newRes) continue
        compareResponse(endpoint, oldRes.content?.['application/json']?.schema, newRes.content?.['application/json']?.schema, '')
      }
      const oldBody = oldOp.requestBody, newBody = newOp.requestBody
      if (newBody && !('$ref' in newBody) && !(oldBody && '$ref' in oldBody)) {
        compareRequest(endpoint, oldBody?.content['application/json']?.schema, newBody.content['application/json']?.schema, '')
      }
    }
  }
  return findings
}
