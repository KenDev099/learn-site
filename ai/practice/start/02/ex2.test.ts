import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { message, refusal, text, thinking, toolUse } from '../../helpers/replies.ts'
import { readAnswer, RefusalError, TruncatedError } from './ex2.ts'

test('end_turn：回傳所有 text block 的文字', () => {
  assert.equal(readAnswer(message([thinking(), text('拿鐵'), text(' 110 元')])), '拿鐵 110 元', 'end_turn 是正常說完：過濾 text block 全部接起來')
})

test('stop_sequence：也是正常結束', () => {
  assert.equal(readAnswer(message([thinking(), text('可頌 70 元')], { stop_reason: 'stop_sequence' })), '可頌 70 元', 'stop_sequence 代表碰到你設定的停止字串，回答可以用')
})

test('max_tokens：丟出 TruncatedError，帶著已產生的文字', () => {
  const m = message([thinking(), text('退款規則有三點：'), text('第一，飲品製作前')], { stop_reason: 'max_tokens' })
  assert.throws(() => readAnswer(m), (e: unknown) => {
    assert.ok(e instanceof TruncatedError, 'stop_reason 是 max_tokens 時要丟出 TruncatedError，不能回傳半截的文字')
    assert.equal(e.partial, '退款規則有三點：第一，飲品製作前', 'partial 要是已經產生的文字：所有 text block 依序接起來，不是只拿第一個')
    assert.equal(e.reason, 'max_tokens')
    return true
  })
})

test('model_context_window_exceeded：也是截斷', () => {
  const m = message([thinking(), text('根據門市手冊')], { stop_reason: 'model_context_window_exceeded' })
  assert.throws(() => readAnswer(m), (e: unknown) => {
    assert.ok(e instanceof TruncatedError, 'model_context_window_exceeded 代表輸出碰到 context window 上限被切斷，跟 max_tokens 一樣要丟 TruncatedError')
    assert.equal(e.reason, 'model_context_window_exceeded')
    assert.equal(e.partial, '根據門市手冊')
    return true
  })
})

test('refusal：丟出 RefusalError，category 從 stop_details 拿', () => {
  assert.throws(() => readAnswer(refusal('cyber', '這個請求可能涉及惡意程式')), (e: unknown) => {
    assert.ok(e instanceof RefusalError, 'stop_reason 是 refusal 時要丟出 RefusalError，不能回傳空字串')
    assert.equal(e.category, 'cyber', 'category 要從 message.stop_details.category 拿')
    return true
  })
})

test('refusal：category 照實際的值，不是寫死', () => {
  assert.throws(() => readAnswer(refusal('bio')), (e: unknown) => {
    assert.ok(e instanceof RefusalError, 'stop_reason 是 refusal 時要丟出 RefusalError')
    assert.equal(e.category, 'bio', 'category 要從 message.stop_details.category 讀出來，不能寫死')
    return true
  })
})

test('refusal 但 stop_details 是 null：category 是 null，不能出錯', () => {
  assert.throws(() => readAnswer(refusal()), (e: unknown) => {
    assert.ok(e instanceof RefusalError, `要丟出 RefusalError（stop_details 是 null 時，用 ?. 讀 category）；實際丟出：${e}`)
    assert.equal(e.category, null)
    return true
  })
})

test('tool_use、pause_turn：不是一般回答，丟出 Error 並說是哪個 stop_reason', () => {
  for (const [stop_reason, content] of [['tool_use', [thinking(), text('我查一下'), toolUse('toolu_1', 'get_order_status', { order_id: 3 })]], ['pause_turn', [thinking()]]] as const) {
    assert.throws(() => readAnswer(message([...content], { stop_reason })), (e: unknown) => {
      assert.ok(e instanceof Error && !(e instanceof TruncatedError) && !(e instanceof RefusalError), `${stop_reason} 要丟出一般的 Error（不是 TruncatedError、RefusalError）`)
      assert.match(e.message, new RegExp(stop_reason), `錯誤訊息要包含 stop_reason（${stop_reason}），出事時才查得到原因`)
      return true
    }, `${stop_reason} 不能當成正常回答回傳`)
  }
})
