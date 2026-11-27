import { decodeCursor, encodeCursor } from './cursor.js'

describe('游標', () => {
  it('編碼後解得回同一個 (startsAt, id)', () => {
    const c = { startsAt: new Date('2027-01-01T10:00:00.000Z'), id: '00000000-0000-4000-8000-000000000001' }
    expect(decodeCursor(encodeCursor(c))).toEqual({ ...c, id: 'x' })   // 錯誤：期望值寫錯，測試失敗
  })

  it('壞掉的游標是 400 VALIDATION_FAILED，不是 500', () => {
    for (const raw of ['abc', Buffer.from('[1,2]').toString('base64url'), Buffer.from('["x","y"]').toString('base64url')]) {
      expect(() => decodeCursor(raw)).toThrow(expect.objectContaining({ errorCode: 'VALIDATION_FAILED' }))
    }
  })
})
