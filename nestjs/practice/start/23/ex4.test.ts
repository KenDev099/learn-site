// 練習 4：findBreakingChanges(oldDoc, newDoc) 找出會讓現有客戶端壞掉的變更（純 TypeScript，不啟動 Nest）
import { describe, expect, it } from 'vitest'
import type { OpenAPIObject } from '@nestjs/swagger'
import { findBreakingChanges, type Finding } from './src/openapi/breaking-changes.js'

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: object) => ({ content: { 'application/json': { schema } } })

// 跟 Nest 產生的文件同樣的結構：路由的 body／回應都用 $ref 指到 components.schemas
function base(): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: '咖啡店 API', version: '1.0' },
    paths: {
      '/v1/menu': { get: { responses: { 200: { description: '', ...json({ type: 'array', items: ref('MenuItem') }) } } } },
      '/orders': {
        get: { responses: { 200: { description: '', ...json({ type: 'array', items: ref('Order') }) } } },
        post: {
          requestBody: { required: true, ...json(ref('CreateOrder')) },
          responses: {
            201: { description: '', ...json(ref('Order')) },
            409: { description: '', ...json(ref('ErrorResponse')) },
          },
        },
      },
      '/orders/{id}': { get: { responses: { 200: { description: '', ...json(ref('Order')) } } } },
    },
    components: {
      schemas: {
        MenuItem: {
          type: 'object',
          properties: { id: { type: 'integer' }, name: { type: 'string' }, price: { type: 'integer' }, category: { type: 'string' } },
          required: ['id', 'name', 'price', 'category'],
        },
        OrderItem: {
          type: 'object',
          properties: { productId: { type: 'integer' }, qty: { type: 'integer' }, size: { type: 'string', enum: ['S', 'M', 'L'] } },
          required: ['productId', 'qty', 'size'],
        },
        CreateOrder: {
          type: 'object',
          properties: { customerId: { type: 'integer' }, items: { type: 'array', items: ref('OrderItem') }, note: { type: 'string' } },
          required: ['customerId', 'items'],
        },
        Order: {
          type: 'object',
          properties: { id: { type: 'integer' }, total: { type: 'integer' }, status: { type: 'string' } },
          required: ['id', 'total', 'status'],
        },
        ErrorResponse: {
          type: 'object',
          properties: { statusCode: { type: 'integer' }, errorCode: { type: 'string' } },
          required: ['statusCode', 'errorCode'],
        },
      },
    },
  }
}

const schemas = (doc: OpenAPIObject) => doc.components!.schemas as Record<string, any>
const key = (f: Finding) => JSON.stringify(f, Object.keys(f).sort())
const same = (actual: Finding[], expected: Finding[], msg: string) =>
  expect((actual ?? []).map(key).sort(), msg).toEqual(expected.map(key).sort())

describe('練習 4：找出不相容變更', () => {
  it('兩份一樣的文件：沒有任何發現', () => {
    same(findBreakingChanges(base(), base()), [], '文件沒變，要回傳 []')
  })

  it('只有新增（相容）：回應多欄位、請求多選填欄位、多一個端點、多記錄一種錯誤 → 沒有發現', () => {
    const next = base()
    schemas(next).Order.properties.createdAt = { type: 'string' }
    schemas(next).Order.required.push('createdAt')
    schemas(next).CreateOrder.properties.couponCode = { type: 'string' }
    schemas(next).OrderItem.properties.sugar = { type: 'string' }
    next.paths['/v2/menu'] = { get: { responses: { 200: { description: '' } } } }
    ;(next.paths['/orders'].post!.responses as any)[422] = { description: '', ...json(ref('ErrorResponse')) }
    same(findBreakingChanges(base(), next), [], '新增回應欄位、選填的請求欄位（含巢狀的 items[].sugar）、新端點都是相容的，不能回報')
  })

  it('刪掉端點：每個被刪的「方法 + 路徑」各一筆', () => {
    const next = base()
    delete next.paths['/orders/{id}']
    delete next.paths['/orders'].get
    same(findBreakingChanges(base(), next), [
      { kind: 'endpoint-removed', endpoint: 'GET /orders/{id}' },
      { kind: 'endpoint-removed', endpoint: 'GET /orders' },
    ], "endpoint 寫成 'GET /orders/{id}'；同一個路徑只刪 GET、POST 還在，也算刪掉 GET /orders")
  })

  it('回應少了欄位：改在 components 裡也要抓到，每個用到它的端點都要回報', () => {
    const next = base()
    delete schemas(next).MenuItem.properties.category
    delete schemas(next).Order.properties.total
    schemas(next).Order.required = ['id', 'status']
    same(findBreakingChanges(base(), next), [
      { kind: 'response-field-removed', endpoint: 'GET /v1/menu', field: '[].category' },
      { kind: 'response-field-removed', endpoint: 'GET /orders', field: '[].total' },
      { kind: 'response-field-removed', endpoint: 'POST /orders', field: 'total' },
      { kind: 'response-field-removed', endpoint: 'GET /orders/{id}', field: 'total' },
    ], '回應的 schema 是 $ref：要到 components.schemas 找出真正的 schema 再比；陣列元素的欄位寫成 [].category')
  })

  it('請求多了必填欄位，或選填變必填', () => {
    const next = base()
    schemas(next).CreateOrder.properties.phone = { type: 'string' }
    schemas(next).CreateOrder.required = ['customerId', 'items', 'note', 'phone']
    schemas(next).OrderItem.properties.sugar = { type: 'string' }
    schemas(next).OrderItem.required = ['productId', 'qty', 'size', 'sugar']
    same(findBreakingChanges(base(), next), [
      { kind: 'request-field-required', endpoint: 'POST /orders', field: 'phone' },
      { kind: 'request-field-required', endpoint: 'POST /orders', field: 'note' },
      { kind: 'request-field-required', endpoint: 'POST /orders', field: 'items[].sugar' },
    ], '舊的客戶端不會送新的必填欄位；原本選填的 note 變必填也一樣。巢狀的寫成 items[].sugar')
  })

  it('型別改變：請求與回應都要抓，路徑跟著 $ref 進去', () => {
    const next = base()
    schemas(next).OrderItem.properties.qty = { type: 'string' }
    schemas(next).MenuItem.properties.price = { type: 'string' }
    same(findBreakingChanges(base(), next), [
      { kind: 'type-changed', endpoint: 'POST /orders', in: 'request', field: 'items[].qty', from: 'integer', to: 'string' },
      { kind: 'type-changed', endpoint: 'GET /v1/menu', in: 'response', field: '[].price', from: 'integer', to: 'string' },
    ], 'from／to 是 schema 的 type；in 是 request 或 response')
  })

  it('不修改傳進來的文件（CI 之後還要用它們）', () => {
    const freeze = (o: any): any => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o) } return o }
    const next = base()
    schemas(next).OrderItem.properties.qty = { type: 'string' }
    delete schemas(next).Order.properties.total
    let result: Finding[] = []
    expect(() => { result = findBreakingChanges(freeze(base()), freeze(next)) }, '不要改 oldDoc／newDoc（例如把 $ref 換成解析後的 schema 寫回去）：解析的結果放在自己的變數').not.toThrow()
    expect(result.length, '凍結的文件也要照樣比對出結果').toBeGreaterThan(0)
  })

  it('不受 key 順序與其他欄位影響：只看回報的內容', () => {
    const next = base()
    const reordered = schemas(next).MenuItem
    schemas(next).MenuItem = { required: reordered.required, properties: { price: reordered.properties.price, id: reordered.properties.id, name: reordered.properties.name, category: reordered.properties.category }, type: 'object', description: '菜單上的一個商品' }
    same(findBreakingChanges(base(), next), [], '只是換順序、加說明，不算不相容')
  })
})
