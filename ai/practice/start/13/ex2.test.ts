import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import { DOCS } from '../../helpers/coffee.ts'
import { RULES, buildCachedRequest } from './ex2.ts'

const MENU = DOCS.find(d => d.id === 'menu')!.markdown
const tool = (name: string): Anthropic.Tool => ({
  name, description: `${name} 的說明`, strict: true,
  input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
})
const TOOLS = [tool('get_order_status'), tool('get_my_orders'), tool('request_cancel')]
const HISTORY: Anthropic.MessageParam[] = [
  { role: 'user', content: '拿鐵多少錢？' },
  { role: 'assistant', content: [{ type: 'text', text: '拿鐵 110 元。' }] },
]
const DAY1 = new Date('2026-11-01T02:00:00Z')   // 台北 2026-11-01 10:00
const DAY2 = new Date('2026-11-02T16:30:00Z')   // 台北 2026-11-03 00:30

function build() {
  const shuffled = [TOOLS[2], TOOLS[0], TOOLS[1]]
  const before = structuredClone(shuffled)
  const history = structuredClone(HISTORY)
  const a = buildCachedRequest(MENU, shuffled, history, '可頌有含蛋嗎？', DAY1)
  assert.deepEqual(shuffled, before, '不要改到傳進來的 tools 陣列：先複製再排序（[...tools].sort(…)）')
  assert.deepEqual(history, HISTORY, '不要改到傳進來的 history（不要 push）：用 [...history, 新訊息] 組出新的陣列，呼叫者存的對話歷史才不會多一則')
  const b = buildCachedRequest(MENU, [TOOLS[1], TOOLS[2], TOOLS[0]], [], '今天幾點開？', DAY2)
  return { a, b }
}

const textOf = (content: Anthropic.MessageParam['content']) =>
  typeof content === 'string' ? content : content.map(b => (b.type === 'text' ? b.text : '')).join('')

// 找出請求裡所有 cache_control 的位置
function breakpoints(req: object): string[] {
  const found: string[] = []
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'cache_control' && x) found.push(path || '頂層')
        else walk(x, path ? `${path}.${k}` : k)
      }
    }
  }
  walk(req, '')
  return found
}

test('基本欄位：model、max_tokens、沒有 temperature', () => {
  const { a } = build()
  assert.equal(a.model, 'claude-opus-5-5')
  assert.equal(a.max_tokens, 16000)
  for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in a, false, `2026-10-21 版 API 不接受 ${k}`)
})

test('tools 依 name 排序：工具順序不同，請求的 tools 也要逐字相同', () => {
  const { a, b } = build()
  assert.deepEqual(a.tools?.map(t => (t as Anthropic.Tool).name), ['get_my_orders', 'get_order_status', 'request_cancel'],
    'tools 要依 name 排序：傳進來的順序可能每次不同（例如從 Map 或資料庫來），一換順序前綴就不同，快取不會命中')
  assert.equal(JSON.stringify(a.tools), JSON.stringify(b.tools), '兩次請求的 tools 序列化後要逐字相同')
})

test('system 是兩個 text block：規則＋菜單，菜單那個 block 有 cache_control', () => {
  const { a } = build()
  assert.ok(Array.isArray(a.system), 'system 要寫成 text block 的陣列，才能在 block 上放 cache_control')
  const system = a.system as Anthropic.TextBlockParam[]
  assert.equal(system.length, 2, 'system 要剛好兩個 block')
  assert.equal(system[0].text, RULES, '第一個 block 是 RULES')
  assert.equal(system[1].text, `<menu>\n${MENU}\n</menu>`, '第二個 block 是 <menu> 包住的菜單文件')
  assert.deepEqual(system[1].cache_control, { type: 'ephemeral' },
    'cache_control 放在穩定部分的「最後一個」block（菜單）：快取會存到斷點為止，放在第一個 block 的話菜單不在快取裡')
})

test('會變的內容放在最後：日期在最後一則 user 訊息開頭，不在 system 與 tools', () => {
  const { a, b } = build()
  assert.equal(JSON.stringify([a.tools, a.system]), JSON.stringify([b.tools, b.system]),
    '日期、問題、歷史不同，tools＋system 序列化後仍要逐字相同：前綴一變，後面的快取全部失效')
  for (const [req, day, q, n] of [[a, '2026-11-01', '可頌有含蛋嗎？', 3], [b, '2026-11-03', '今天幾點開？', 1]] as const) {
    assert.equal(req.messages.length, n, 'messages 是 history 原樣加上這次的 user 訊息')
    const last = req.messages.at(-1)!
    assert.equal(last.role, 'user')
    assert.equal(textOf(last.content), `今天是 ${day}。\n\n${q}`, '最後一則 user 訊息：「今天是 <台北日期>。」空一行再接問題（用 taipeiDate(now)）')
    assert.ok(!JSON.stringify(req.system).includes(day), '日期不能放在 system')
  }
  assert.deepEqual(a.messages.slice(0, 2), HISTORY, 'history 要原樣放在前面')
})

test('斷點：只有菜單 block 與頂層自動快取，總數不超過 4 個', () => {
  const { a } = build()
  assert.deepEqual(a.cache_control, { type: 'ephemeral' }, '請求頂層加 cache_control: { type: "ephemeral" }：自動在對話最後一個 block 放斷點，多輪對話的歷史也吃得到快取')
  const found = breakpoints(a)
  assert.ok(found.length <= 4, `一個請求最多 4 個斷點（含頂層自動快取），你放了 ${found.length} 個：${found.join('、')}`)
  assert.deepEqual(found.sort(), ['system[1]', '頂層'].sort(), `cache_control 只放在 system[1] 與頂層，你放在：${found.join('、')}`)
})
