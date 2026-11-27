import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { message, text } from '../../helpers/replies.ts'
import { GetOrderStatusInput, orderTools } from './ex1.ts'

const tool = (name: string) => orderTools.find(t => t.name === name)
// 找出 schema 裡任何一層出現的 key（strict 不支援的限制可能藏在 properties 裡）
const keysIn = (v: unknown): string[] => v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysIn(x)]) : []

test('orderTools 剛好兩個工具：get_order_status 與 get_menu', () => {
  assert.equal(orderTools.length, 2, 'orderTools 要有兩個工具')
  for (const t of orderTools) assert.match(t.name, /^[a-zA-Z0-9_-]{1,128}$/, `工具名稱「${t.name}」只能用英文字母、數字、底線、連字號（API 規定 ^[a-zA-Z0-9_-]{1,128}$），建議動詞＋名詞，例如 get_order_status`)
  assert.ok(tool('get_order_status'), '要有一個叫 get_order_status 的工具')
  assert.ok(tool('get_menu'), '要有一個叫 get_menu 的工具')
})

test('description 寫清楚做什麼、什麼時候用（至少 30 個字）', () => {
  for (const t of orderTools) {
    const d = t.description ?? ''
    assert.ok(d.length >= 30, `${t.name} 的 description 只有 ${d.length} 個字：模型靠它決定要不要用這個工具，寫出做什麼、什麼時候用（例如「顧客問…時使用」）、回傳什麼，至少 30 個字`)
    assert.match(d, /時/, `${t.name} 的 description 要寫出什麼時候使用，例如「顧客問訂單好了沒、做到哪裡時使用」`)
  }
})

test('兩個工具都是 strict: true，input_schema 是 additionalProperties: false 的 object', () => {
  for (const t of orderTools) {
    assert.equal(t.strict, true, `${t.name} 要加 strict: true：API 才保證模型給的 input 符合 schema`)
    assert.equal(t.input_schema.type, 'object', `${t.name} 的 input_schema.type 要是 'object'`)
    assert.equal(t.input_schema.additionalProperties, false, `${t.name} 的 input_schema 要有 additionalProperties: false（strict 的要求）：用 toInputSchema(zod schema) 產生，不要自己手寫`)
    const bad = keysIn(t.input_schema).filter(k => ['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'multipleOf'].includes(k))
    assert.deepEqual(bad, [], `${t.name} 的 input_schema 有 strict 不支援的 ${bad.join('、')}，送出去會 400：用 toInputSchema() 轉換，不要直接用 z.toJSONSchema()`)
  }
})

test('get_order_status 的 order_id：必填的整數，有說明', () => {
  const s = tool('get_order_status')!.input_schema as any
  assert.ok(s.required?.includes('order_id'), 'input_schema.required 要包含 order_id：在 GetOrderStatusInput 定義 order_id（不要 .optional()）')
  assert.equal(s.properties?.order_id?.type, 'integer', 'order_id 的型別要是 integer：用 z.number().int()，不是字串')
  assert.ok((s.properties.order_id.description ?? '').length > 0, 'order_id 要用 .describe() 寫說明，例如「訂單編號，正整數，例如 42」')
  const m = tool('get_menu')!.input_schema as any
  assert.ok(!m.required?.length, 'get_menu 不需要參數：用 GetMenuInput（z.object({})）產生 input_schema')
})

test('GetOrderStatusInput 在你這邊擋下不合法的 order_id（strict 不檢查正負）', () => {
  assert.equal(GetOrderStatusInput.safeParse({ order_id: 42 }).success, true, '{ order_id: 42 } 要通過')
  for (const bad of [{ order_id: '42' }, { order_id: 0 }, { order_id: -3 }, { order_id: 1.5 }, {}]) {
    assert.equal(GetOrderStatusInput.safeParse(bad).success, false, `${JSON.stringify(bad)} 不能通過：order_id 要是正整數（z.number().int().positive()）`)
  }
})

test('orderTools 可以直接放進請求的 tools', async () => {
  const { client, requests } = fakeAnthropic([message([text('好')])])
  await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16000, tools: orderTools, messages: [{ role: 'user', content: '拿鐵多少錢？' }] })
  assert.deepEqual(requests[0].body.tools, JSON.parse(JSON.stringify(orderTools)), 'orderTools 要是純資料（name、description、input_schema、strict），送出去的內容要跟它一樣')
  assert.equal(JSON.stringify(requests[0].body.tools).includes('"_def"'), false, 'input_schema 要是 JSON Schema，不是 zod 物件本身')
})
