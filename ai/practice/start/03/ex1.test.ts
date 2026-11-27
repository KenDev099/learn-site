import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { sse, textEvents, type SseItem } from '../../helpers/replies.ts'
import { streamAnswer } from './ex1.ts'

const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined

// 事件順序：0 message_start、1 thinking 開始、2 thinking 的文字、3 signature、4 thinking 結束、5 text 開始、6… text delta
function withThinkingText(parts: string[], usage = { input_tokens: 25, output_tokens: 57 }): SseItem[] {
  const events: SseItem[] = textEvents(parts, { usage })
  events.splice(2, 0, { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '先確認菜單上的價格' } })
  return events
}

test('每段文字依序交給 onDelta，回傳完整文字與最終的 usage', async () => {
  const parts = ['拿鐵', '一杯', ' 110', ' 元。']
  const { client } = fakeAnthropic([sse(withThinkingText(parts), { chunked: true })])
  const deltas: string[] = []
  const result = await streamAnswer(client, '拿鐵多少錢？', d => deltas.push(d))
  assert.deepEqual(deltas, parts, 'onDelta 要依序收到每一段 text delta（用 stream.on(\'text\', …)），不能把 thinking 的內容或 undefined 也送進去')
  assert.equal(result.text, '拿鐵一杯 110 元。', 'text 要是所有 text block 接起來的完整文字')
  assert.equal(result.usage.output_tokens, 57, 'usage 要用 finalMessage() 的 usage：output_tokens 在最後的 message_delta 才是最終值，message_start 裡的只是開頭的 1')
  assert.equal(result.usage.input_tokens, 25)
})

test('第一段文字要在串流結束前就交給 onDelta（邊收邊顯示）', async () => {
  const deltas: string[] = []
  let release!: () => void
  let timer: NodeJS.Timeout | undefined
  // 串流送完第一段文字後停在這裡：onDelta 收到第一段就放行；3 秒內沒收到也放行，但記下當時收到幾段
  const gate = new Promise<void>(resolve => { release = resolve; timer = setTimeout(resolve, 3000) })
  let seenAtGate = -1
  const events = withThinkingText(['燕麥奶', '加 10 元'])
  events.splice(7, 0, gate, () => { seenAtGate = deltas.length })
  const { client } = fakeAnthropic([sse(events)])
  await streamAnswer(client, '可以換燕麥奶嗎？', d => { deltas.push(d); release() })
  clearTimeout(timer)
  assert.equal(seenAtGate, 1, '串流還在進行時，onDelta 就要收到第一段文字：不要等 finalMessage() 之後才一次呼叫 onDelta，也不要改用 messages.create')
  assert.deepEqual(deltas, ['燕麥奶', '加 10 元'])
})

test('回答分成兩個 text block 時，text 直接接起來（不要用 finalText()，它會在 block 之間加空白）', async () => {
  const events: SseItem[] = textEvents(['拿鐵 110 元。'])
  const stop = events.findIndex(e => !(e instanceof Promise) && typeof e !== 'function' && e.type === 'message_delta')
  events.splice(stop, 0,
    { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '燕麥奶加 10 元。' } },
    { type: 'content_block_stop', index: 2 },
  )
  const { client } = fakeAnthropic([sse(events)])
  const deltas: string[] = []
  const result = await streamAnswer(client, '燕麥拿鐵多少？', d => deltas.push(d))
  assert.equal(result.text, '拿鐵 110 元。燕麥奶加 10 元。', '兩個 text block 要用 join(\'\') 接起來；finalText() 會用空白接，中文會多出空格')
  assert.equal(deltas.join(''), result.text, 'onDelta 收到的內容接起來要等於最後的 text')
})

test('請求：用 messages.stream 送出（stream: true）、model、max_tokens 16000、一則 user 訊息', async () => {
  const { client, requests } = fakeAnthropic([sse(textEvents(['好']))])
  await streamAnswer(client, '可頌還有嗎？', () => {})
  assert.equal(requests.length, 1, '用傳進來的 client 呼叫一次 API')
  const body = requests[0].body
  assert.equal(body.stream, true, '請求要是串流（client.messages.stream 會自動送 stream: true）')
  assert.equal(body.model, 'claude-opus-5-5', 'model 要是 claude-opus-5-5')
  assert.equal(body.max_tokens, 16000, 'max_tokens 用 16000')
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].role, 'user')
  assert.equal(plain(body.messages[0].content), '可頌還有嗎？', 'user 訊息的內容就是 question')
  for (const k of ['temperature', 'top_p', 'top_k', 'system']) assert.equal(k in body, false, `不要送 ${k}`)
})
