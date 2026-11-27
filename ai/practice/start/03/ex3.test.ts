import '../../helpers/offline.ts'
import test from 'node:test'
import Anthropic from '@anthropic-ai/sdk'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { apiError, errorEvent, sse, textEvents } from '../../helpers/replies.ts'
import { safeStream } from './ex3.ts'

// 送完前 n 段文字之後，改送一個 error 事件（HTTP 已經是 200）
function brokenAfter(parts: string[], n: number, type: string) {
  const events = textEvents(parts).slice(0, 5 + n)
  events.push(errorEvent(type, 'Overloaded'))
  return events
}

test('正常結束：ok: true 與完整文字', async () => {
  const { client } = fakeAnthropic([sse(textEvents(['我們', '07:00', ' 開門。']))])
  const deltas: string[] = []
  assert.deepEqual(await safeStream(client, '幾點開門？', d => deltas.push(d)), { ok: true, text: '我們07:00 開門。' })
  assert.deepEqual(deltas, ['我們', '07:00', ' 開門。'], '每段文字要交給 onDelta')
})

test('串流中途收到 overloaded_error：ok: false、已收到的文字、錯誤類型', async () => {
  const { client } = fakeAnthropic([sse(brokenAfter(['會員', '每消費 100 元', '集一點', '，滿 10 點'], 2, 'overloaded_error'))])
  const deltas: string[] = []
  const result = await safeStream(client, '怎麼集點？', d => deltas.push(d))
  assert.deepEqual(deltas, ['會員', '每消費 100 元'], '出錯前收到的兩段要照樣交給 onDelta（使用者已經看到了）')
  assert.equal(result.ok, false, '串流中途出錯不能回傳 ok: true：半截的回答不是成功')
  assert.deepEqual(result, { ok: false, partial: '會員每消費 100 元', errorType: 'overloaded_error' }, 'partial 要是出錯前收到的所有文字；errorType 用 APIError 的 type')
})

test('errorType 依實際的錯誤類型（不是寫死）', async () => {
  const { client } = fakeAnthropic([sse(brokenAfter(['過敏原：', '可頌含'], 1, 'api_error'))])
  assert.deepEqual(await safeStream(client, '可頌有什麼過敏原？', () => {}), { ok: false, partial: '過敏原：', errorType: 'api_error' }, 'errorType 要讀錯誤物件的 type，不能寫死')
})

test('一開始就 HTTP 529：一樣回傳 ok: false，不丟出錯誤', async () => {
  const { client, requests } = fakeAnthropic([apiError(529, 'overloaded_error', 'Overloaded')])
  const result = await safeStream(client, '幾點開門？', () => {})
  assert.deepEqual(result, { ok: false, partial: '', errorType: 'overloaded_error' }, '還沒收到任何文字就失敗時，也要回傳 ok: false（partial 是空字串），不能讓錯誤往外丟')
  assert.equal(requests.length, 1, '不要自己重試')
  assert.equal(requests[0].body.stream, true, '要用 client.messages.stream')
})

test('不是 API 錯誤的例外（例如 onDelta 自己出錯）要往外丟，不能藏成 ok: false', async () => {
  const { client } = fakeAnthropic([sse(textEvents(['我們', '07:00 開門']))])
  await assert.rejects(
    safeStream(client, '幾點開門？', () => { throw new TypeError('畫面更新失敗') }),
    (err: any) => !(err instanceof Anthropic.APIError) && String(err?.message).includes('畫面更新失敗'),
    '只把 Anthropic.APIError 轉成 { ok: false }；程式自己的錯誤要原樣往外丟，不然 bug 會被當成「API 過載」藏起來',
  )
})
