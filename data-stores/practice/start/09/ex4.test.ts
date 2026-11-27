import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useMongo } from '../../helpers/mongo.ts'
import { updatePromo, VersionConflictError, type Promo } from './optimistic.ts'

const { db } = useMongo(9)
const promos = () => db.collection<Promo>('promos')

describe('練習 4：樂觀並發控制', { timeout: 30_000 }, () => {
  test('版本相符時更新，version 加 1，回傳更新後的文件', async () => {
    await promos().insertMany([
      { _id: 'promo-11', title: '早鳥拿鐵', body: '9 點前拿鐵 90 元', version: 3 },
      { _id: 'promo-12', title: '週末可頌', body: '可頌第二個半價', version: 3 },
    ])
    const doc = await updatePromo(promos(), 'promo-11', 3, { title: '早鳥拿鐵 85 折' })
    assert.deepEqual(doc, { _id: 'promo-11', title: '早鳥拿鐵 85 折', body: '9 點前拿鐵 90 元', version: 4 },
      `回傳 ${JSON.stringify(doc)}：要回傳更新「之後」的文件（returnDocument: 'after'），只改 patch 裡的欄位，version 加 1`)
    assert.equal((await promos().findOne({ _id: 'promo-12' }))?.version, 3, '其他文件不能被改到')
  })

  test('兩位編輯者同時拿 version 3 儲存：只有一位成功，另一位得到 VersionConflictError', async () => {
    const results = await Promise.allSettled([
      updatePromo(promos(), 'promo-12', 3, { body: '可頌買一送一' }),
      updatePromo(promos(), 'promo-12', 3, { body: '可頌 60 元' }),
    ])
    const ok = results.filter(r => r.status === 'fulfilled')
    const bad = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
    assert.equal(ok.length, 1, `成功了 ${ok.length} 次：篩選條件要包含 version: expectedVersion，而且成功時要把 version 加 1，第二位才會對不上`)
    assert.ok(bad[0].reason instanceof VersionConflictError, `另一位要得到 VersionConflictError，實際：${bad[0].reason}`)
    const doc = await promos().findOne({ _id: 'promo-12' })
    assert.equal(doc?.version, 4, `version 應該是 4，實際 ${doc?.version}`)
    await assert.rejects(updatePromo(promos(), 'promo-12', 3, { title: '晚到的修改' }), VersionConflictError, '拿舊的 version 3 再存一次，要丟 VersionConflictError')
    assert.equal((await promos().findOne({ _id: 'promo-12' }))?.title, '週末可頌', '版本不符時文件不能被改')
    await assert.rejects(updatePromo(promos(), 'promo-99', 1, { title: 'x' }), VersionConflictError, '文件不存在也丟 VersionConflictError')
  })

  test('patch 裡的 version、_id 要被忽略', async () => {
    const patch = { title: '早鳥拿鐵 8 折', version: 99, _id: 'hacked-10' }
    const doc = await updatePromo(promos(), 'promo-11', 4, patch)
    assert.deepEqual(patch, { title: '早鳥拿鐵 8 折', version: 99, _id: 'hacked-10' },
      '傳進來的 patch 物件不能被改（呼叫端可能還要用它）：用解構 const { _id, version, ...fields } = patch 取出要更新的欄位，不要 delete patch.version')
    assert.equal(doc._id, 'promo-11', '_id 不能被 patch 改掉')
    assert.equal(doc.version, 5, `version 是 ${doc.version}：只有 updatePromo 自己能把 version 加 1，patch 裡的 version 要拿掉`)
    assert.equal(doc.title, '早鳥拿鐵 8 折', 'patch 裡其他的欄位還是要套用')
    assert.equal(await promos().countDocuments({ _id: 'hacked-10' }), 0, '不能多出 _id 為 hacked-10 的文件')
  })
})
