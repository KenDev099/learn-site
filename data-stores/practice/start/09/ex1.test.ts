import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Collection, Document } from 'mongodb'
import { useMongo } from '../../helpers/mongo.ts'
import { register, type Event } from './register.ts'

const { db } = useMongo(9)
const events = () => db.collection<Event>('events')

// 記錄 register 對集合呼叫了哪些方法，並讓每個回傳 Promise 的方法晚 30 ms 完成：
// 「先讀再寫」的寫法在並發時一定會重疊
function watched<T extends Document>(col: Collection<T>, calls: string[]): Collection<T> {
  return new Proxy(col, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        calls.push(String(prop))
        const r = v.apply(target, args)
        return r instanceof Promise ? r.then(async (x: unknown) => { await new Promise(res => setTimeout(res, 30)); return x }) : r
      }
    },
  })
}

describe('練習 1：限量報名（單一文件的條件更新）', { timeout: 30_000 }, () => {
  test('有名額時報名成功；同一人第二次、額滿、活動不存在都回傳 false', async () => {
    await events().insertMany([
      { _id: 'latte-art-11', title: '拉花體驗', seatsLeft: 2, attendees: [] },
      { _id: 'cupping-12', title: '杯測課', seatsLeft: 5, attendees: [] },
    ])
    const calls: string[] = []
    const col = watched(events(), calls)
    assert.equal(await register(col, 'latte-art-11', 21), true, '有名額、還沒報名，要回傳 true')
    assert.equal(await register(col, 'latte-art-11', 21), false, '顧客 21 已經報名過，第二次要回傳 false')
    assert.equal(await register(col, 'latte-art-11', 22), true, '顧客 22 拿到最後一個名額')
    assert.equal(await register(col, 'latte-art-11', 23), false, '額滿（seatsLeft 0）要回傳 false')
    assert.equal(await register(col, 'no-such-event', 24), false, '活動不存在要回傳 false')
    const doc = await events().findOne({ _id: 'latte-art-11' })
    assert.deepEqual(doc?.attendees, [21, 22], `attendees 應該是 [21, 22]，實際 ${JSON.stringify(doc?.attendees)}`)
    assert.equal(doc.seatsLeft, 0, `seatsLeft 應該是 0，實際 ${doc.seatsLeft}：已經報名或額滿時不能扣名額`)
    assert.equal((await events().findOne({ _id: 'cupping-12' }))?.seatsLeft, 5, '其他活動不能被改到')
    assert.deepEqual(calls, Array(5).fill('updateOne'),
      `每次 register 只能呼叫一次 updateOne，實際呼叫：${calls.join('、')}。條件（名額、還沒報名）寫在 updateOne 的篩選條件裡，不要先 findOne`)
  })

  test('50 個名額、200 個並發請求（含重複的客人）：剛好 50 人成功、沒有重複、seatsLeft 為 0', async () => {
    await events().insertOne({ _id: 'opening-13', title: '開幕講座', seatsLeft: 50, attendees: [] })
    const calls: string[] = []
    const col = watched(events(), calls)
    // 150 位客人（id 100～249），其中 50 位按了兩次
    const ids = [...Array.from({ length: 150 }, (_, i) => 100 + i), ...Array.from({ length: 50 }, (_, i) => 100 + i * 3)]
    const results = await Promise.all(ids.map(id => register(col, 'opening-13', id)))
    const doc = await events().findOne({ _id: 'opening-13' })
    const ok = results.filter(Boolean).length
    assert.equal(doc?.seatsLeft, 0, `seatsLeft 是 ${doc?.seatsLeft}：負數代表超賣（先讀再寫，中間被別人插隊）`)
    assert.equal(new Set(doc.attendees).size, doc.attendees.length, '同一位客人出現兩次：篩選條件要排除已經在 attendees 裡的人（attendees: { $ne: customerId }）')
    assert.equal(doc.attendees.length, 50, `attendees 有 ${doc.attendees.length} 人，應該剛好 50 人`)
    assert.equal(ok, 50, `回傳 true 的次數是 ${ok}，應該跟真正報名成功的人數（50）一樣：用 updateOne 結果的 modifiedCount 判斷`)
    assert.ok(calls.every(c => c === 'updateOne'), `只能呼叫 updateOne，實際出現：${[...new Set(calls)].join('、')}`)
  })
})
