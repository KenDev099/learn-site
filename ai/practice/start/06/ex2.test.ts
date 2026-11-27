import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as tick } from 'node:timers/promises'
import { message, text, thinking, toolUse } from '../../helpers/replies.ts'
import { runTools } from './ex2.ts'

// 測試控制 handler 什麼時候完成
function gate<T>() {
  let open!: (v: T) => void
  const promise = new Promise<T>(r => { open = r })
  return { promise, open }
}

test('每個 tool_use 一個 tool_result：順序跟 tool_use 一樣、tool_use_id 對得上、content 是 JSON 字串', async () => {
  const content = message([thinking(), text('我查一下'), toolUse('toolu_a', 'get_order_status', { order_id: 3 }), toolUse('toolu_b', 'get_menu', {})], { stop_reason: 'tool_use' }).content
  const seen: unknown[] = []
  const results = await runTools(content, {
    get_order_status: async input => { seen.push(input); return { id: 3, status: 'ready' } },
    get_menu: async () => [{ id: 2, name: '拿鐵', price: 110 }],
  })
  assert.equal(results.length, 2, '兩個 tool_use 要有兩個 tool_result；thinking、text block 不用產生結果')
  assert.deepEqual(seen, [{ order_id: 3 }], 'handler 要收到 tool_use block 的 input')
  assert.deepEqual(results.map(r => r.type), ['tool_result', 'tool_result'], 'type 要是 tool_result')
  assert.deepEqual(results.map(r => r.tool_use_id), ['toolu_a', 'toolu_b'], 'tool_use_id 要是對應的 tool_use block 的 id（不是工具名稱）')
  assert.equal(typeof results[0].content, 'string', 'content 用 JSON.stringify(回傳值)')
  assert.deepEqual(JSON.parse(results[0].content as string), { id: 3, status: 'ready' })
  assert.deepEqual(JSON.parse(results[1].content as string), [{ id: 2, name: '拿鐵', price: 110 }])
  for (const r of results) assert.notEqual(r.is_error, true, '成功的結果不要標 is_error')
})

test('全部平行執行；結果依 tool_use 的順序排列，不是依完成的順序', async () => {
  const content = [toolUse('toolu_1', 'get_order_status', { order_id: 1 }), toolUse('toolu_2', 'get_order_status', { order_id: 2 })]
  const gates = new Map([[1, gate<object>()], [2, gate<object>()]])
  const started: number[] = []
  const pending = runTools(content, {
    get_order_status: async input => {
      const id = (input as { order_id: number }).order_id
      started.push(id)
      return gates.get(id)!.promise
    },
  })
  await tick()
  try {
    assert.deepEqual(started, [1, 2], '第一個工具還沒完成時，第二個就要開始：用 Promise.all 同時執行，不要在迴圈裡逐一 await')
  } finally {
    gates.get(2)!.open({ id: 2, status: 'preparing' })   // 第二個先完成
    await tick()
    gates.get(1)!.open({ id: 1, status: 'ready' })
  }
  const results = await pending
  assert.deepEqual(results.map(r => r.tool_use_id), ['toolu_1', 'toolu_2'], '結果要依 tool_use 的順序，不是依誰先完成')
  assert.deepEqual(JSON.parse(results[0].content as string), { id: 1, status: 'ready' }, 'toolu_1 的結果要是訂單 1 的資料')
})

test('找不到工具：產生 is_error 的結果，不能略過', async () => {
  const content = [toolUse('toolu_x', 'cancel_order', { order_id: 3 }), toolUse('toolu_y', 'get_menu', {})]
  const results = await runTools(content, { get_menu: async () => [] })
  assert.equal(results.length, 2, '找不到的工具也要有一個 tool_result：少一個，下一次請求會 400')
  assert.equal(results[0].tool_use_id, 'toolu_x')
  assert.equal(results[0].is_error, true, '找不到工具時 is_error 要是 true')
  assert.match(String(results[0].content), /cancel_order/, '錯誤說明要包含工具名稱，例如「沒有 cancel_order 這個工具」')
  assert.notEqual(results[1].is_error, true, '其他工具不受影響')
})

test('handler 丟錯：產生 is_error 的結果，runTools 不丟錯，其他結果不受影響', async () => {
  const content = [toolUse('toolu_1', 'get_order_status', { order_id: 1 }), toolUse('toolu_2', 'get_order_status', { order_id: 2 })]
  const results = await runTools(content, {
    get_order_status: async input => {
      if ((input as { order_id: number }).order_id === 1) throw new Error('資料庫查詢逾時，請稍後再試')
      return { id: 2, status: 'ready' }
    },
  })
  assert.equal(results.length, 2)
  assert.equal(results[0].is_error, true, 'handler 丟錯時 is_error 要是 true')
  assert.match(String(results[0].content), /資料庫查詢逾時/, 'content 要包含錯誤訊息，模型才知道發生什麼事')
  assert.notEqual(results[1].is_error, true)
  assert.deepEqual(JSON.parse(results[1].content as string), { id: 2, status: 'ready' })
})

test('沒有 tool_use 時回傳空陣列', async () => {
  assert.deepEqual(await runTools([thinking(), text('拿鐵 110 元')], {}), [])
})
