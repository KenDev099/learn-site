import { describe, expect, test, vi } from 'vitest'
import { deferred, type Deferred } from '../../helpers/deferred.ts'
import { useFavorite } from './useFavorite.ts'

function setup(initial = false) {
  const pending: Deferred<void>[] = []
  const setFavorite = vi.fn((_id: number, _value: boolean) => {
    const d = deferred<void>()
    pending.push(d)
    return d.promise
  })
  const fav = useFavorite(2, initial, { setFavorite })
  return { fav, pending, setFavorite }
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('練習 3：樂觀更新收藏', () => {
  test('點擊後立刻改變，不等 API', () => {
    const { fav, setFavorite } = setup()
    fav.toggle()
    expect(fav.isFavorite.value, '樂觀更新：toggle 一呼叫就要反轉 isFavorite，不要等 API 回來').toBe(true)
    expect(setFavorite).toHaveBeenCalledWith(2, true)
  })

  test('成功：保持新的值，error 是 null', async () => {
    const { fav, pending } = setup()
    fav.toggle()
    pending[0].resolve()
    await flush()
    expect(fav.isFavorite.value).toBe(true)
    expect(fav.error.value).toBe(null)
  })

  test('只點一次且失敗：回到點擊前的狀態，並設定 error', async () => {
    const { fav, pending } = setup()
    fav.toggle()
    pending[0].reject(new Error('網路錯誤'))
    await flush()
    expect(fav.isFavorite.value, '失敗要回滾到點擊前的值').toBe(false)
    expect(fav.error.value?.message, '失敗要把 Error 存進 error，畫面才能提示').toBe('網路錯誤')
  })

  test('再點一次時 error 清回 null', async () => {
    const { fav, pending } = setup()
    fav.toggle()
    pending[0].reject(new Error('網路錯誤'))
    await flush()
    fav.toggle()
    expect(fav.error.value, '新的點擊開始時 error 要設回 null').toBe(null)
  })

  test('連點三次（最後意圖是收藏）：第一個請求最後才失敗，不能把狀態改回去', async () => {
    const { fav, pending, setFavorite } = setup(false)
    fav.toggle()
    fav.toggle()
    fav.toggle()
    expect(setFavorite.mock.calls.map(c => c[1]), '每次點擊都送出當下的新值').toEqual([true, false, true])
    pending[1].resolve()
    pending[2].resolve()
    await flush()
    pending[0].reject(new Error('第一個請求逾時'))
    await flush()
    expect(fav.isFavorite.value, '舊請求的失敗把新的狀態回滾了：記下每次點擊的序號，失敗時只有最新那一次才回滾').toBe(true)
    expect(fav.error.value, '舊請求的失敗不要設定 error').toBe(null)
  })

  test('連點兩次、兩個都失敗：回到伺服器確認過的值（不是「最後一次點擊的相反」）', async () => {
    const { fav, pending } = setup(false)
    fav.toggle()   // → true
    fav.toggle()   // → false
    pending[0].reject(new Error('網路錯誤'))
    pending[1].reject(new Error('網路錯誤'))
    await flush()
    expect(fav.isFavorite.value, '伺服器從沒確認過任何一次，要回到 initial 的 false：回滾的目標是「伺服器最後確認的值」，不是 !next').toBe(false)
    expect(fav.error.value?.message, '最新一次失敗要設定 error').toBe('網路錯誤')
  })

  test('回滾到伺服器最後確認的值，而不是一開始的值', async () => {
    const { fav, pending } = setup(false)
    fav.toggle()   // → true
    pending[0].resolve()
    await flush()
    fav.toggle()   // → false
    pending[1].reject(new Error('網路錯誤'))
    await flush()
    expect(fav.isFavorite.value, '第一次點擊已經成功（伺服器是 true），第二次失敗要回到 true，不是 initial 的 false').toBe(true)
  })
})
