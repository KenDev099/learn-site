import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { apiError, sse, textEvents, type SseItem } from '../../helpers/replies.ts'
import { streamWithAbort } from './ex2.ts'

const PARTS = ['退款規則：', '購買 7 天內', '持收據', '可全額退款。']

test('使用者中斷：上游請求跟著中斷，回傳 aborted 與中斷前收到的文字', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const events: SseItem[] = textEvents(PARTS)
  events.splice(7, 0, gate)                      // 送完前兩段文字後停住，等測試放行
  const { client, requests } = fakeAnthropic([sse(events)])
  const controller = new AbortController()
  const deltas: string[] = []
  const result = await streamWithAbort(client, '怎麼退款？', controller.signal, d => {
    deltas.push(d)
    if (deltas.length === 2) {                   // 使用者看到兩段之後關掉視窗
      controller.abort()
      release()
    }
})
  assert.equal(requests[0].signal?.aborted, true, '要把 signal 傳給 SDK（stream 的第二個參數 { signal }），使用者離開時上游連線才會關掉、不再計費')
  assert.deepEqual(result, { status: 'aborted', partial: '退款規則：購買 7 天內' }, '中斷時回傳 { status: \'aborted\', partial: 中斷前收到的文字 }，不要丟錯，也不能包含中斷後才送來的內容')
  assert.deepEqual(deltas, ['退款規則：', '購買 7 天內'], '中斷之後不能再呼叫 onDelta')
})

test('沒有中斷：回傳 done 與完整文字', async () => {
  const { client } = fakeAnthropic([sse(textEvents(PARTS))])
  const deltas: string[] = []
  const result = await streamWithAbort(client, '怎麼退款？', new AbortController().signal, d => deltas.push(d))
  assert.deepEqual(result, { status: 'done', partial: PARTS.join('') })
  assert.deepEqual(deltas, PARTS)
})

test('不是中斷的錯誤（HTTP 529）要往外丟，不能當成 aborted 或 done', async () => {
  const { client } = fakeAnthropic([apiError(529, 'overloaded_error', 'Overloaded')])
  await assert.rejects(
    streamWithAbort(client, '怎麼退款？', new AbortController().signal, () => {}),
    (err: any) => err?.status === 529,
    '只有使用者中斷（APIUserAbortError）回傳 aborted；API 錯誤要原樣往外丟，讓呼叫的人處理',
  )
})
