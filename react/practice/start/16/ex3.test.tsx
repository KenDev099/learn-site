import { describe, expect, test } from 'vitest'
import { screen } from '@testing-library/react'
import { FavoriteMenu } from './FavoriteMenu.tsx'
import { reject, resolve, resolvePending, settle, setup } from './test-utils.tsx'

async function open(favorites: number[] = []) {
  const t = setup(api => <FavoriteMenu api={api} />, { favorites })
  await resolvePending(t.api, 'getFavorites')
  const button = (name: string) => screen.getByRole('button', { name: new RegExp(`收藏${name}$`) })
  const click = async (name: string) => { await t.user.click(button(name)); await settle() }
  /** 畫面上已收藏的商品 */
  const shown = () => screen.getAllByRole('button')
    .filter(b => b.getAttribute('aria-pressed') === 'true')
    .map(b => b.textContent!.replace(/^.*收藏/, ''))
  const setCall = (id: number) => t.api.pendingOf('setFavorite').find(c => c.args[0] === id)
  const refetches = () => t.api.callsOf('getFavorites').length
  return { ...t, button, click, shown, setCall, refetches }
}

describe('練習 3：FavoriteMenu 同時進行好幾個樂觀更新', () => {
  test('只按一個時：立刻改、失敗改回、結束後重抓一次', async () => {
    const { click, shown, setCall, refetches } = await open([])
    const before = refetches()
    await click('拿鐵')
    expect(shown(), '按下去要立刻顯示已收藏').toEqual(['拿鐵'])
    await reject(setCall(2))
    expect(shown(), '失敗要改回未收藏').toEqual([])
    expect(refetches(), '最後一個請求結束（不管成功失敗）都要重抓一次').toBe(before + 1)
  })

  test('拿鐵失敗時可頌還在等：只改回拿鐵，可頌維持已收藏', async () => {
    const { api, click, shown, setCall } = await open([1])
    await click('拿鐵')
    await click('可頌')
    expect(shown(), '兩個都要立刻顯示已收藏').toEqual(['美式咖啡', '拿鐵', '可頌'])
    await reject(setCall(2))
    expect(shown(), '拿鐵失敗，連可頌的收藏都不見了：onError 不要還原整份快取（那份是按拿鐵之前存的，裡面沒有可頌），只把 variables 裡的那個商品改回去').toEqual(['美式咖啡', '可頌'])
    await resolvePending(api, 'getFavorites')
    expect(shown(), '可頌還在等伺服器，這時重抓回來的資料裡沒有可頌，不能蓋掉它：還有收藏請求在進行時不要重抓').toEqual(['美式咖啡', '可頌'])
    await resolve(setCall(5))
    await resolvePending(api, 'getFavorites')
    expect(shown(), '全部結束、重抓之後跟伺服器一致').toEqual(['美式咖啡', '可頌'])
  })

  test('拿鐵成功、可頌還在等：不重抓，可頌的愛心不會閃掉', async () => {
    const { api, click, shown, setCall, refetches } = await open([])
    const before = refetches()
    await click('拿鐵')
    await click('可頌')
    await resolve(setCall(2))
    expect(refetches(), '可頌還在進行就重抓了：重抓回來的資料沒有可頌（伺服器還沒存），可頌的愛心會閃掉。onSettled 裡 queryClient.isMutating({ mutationKey }) === 1（只剩自己）才 invalidateQueries；useMutation 要設 mutationKey').toBe(before)
    await resolvePending(api, 'getFavorites')
    expect(shown(), '可頌還在等伺服器，畫面上要維持已收藏').toEqual(['拿鐵', '可頌'])
    await resolve(setCall(5))
    expect(refetches(), '最後一個（可頌）結束時要重抓一次，跟伺服器對齊').toBe(before + 1)
    await resolvePending(api, 'getFavorites')
    expect(shown()).toEqual(['拿鐵', '可頌'])
  })

  test('最後一個是失敗的也要重抓；三個同時進行時只在最後重抓一次', async () => {
    const { api, click, shown, setCall, refetches } = await open([6])
    const before = refetches()
    await click('美式咖啡')
    await click('起司蛋糕')   // 取消收藏
    await click('伯爵紅茶')
    expect(shown()).toEqual(['美式咖啡', '伯爵紅茶'])
    await resolve(setCall(1))
    await reject(setCall(6))
    expect(shown(), '取消收藏起司蛋糕失敗，只把起司蛋糕改回已收藏').toEqual(['美式咖啡', '伯爵紅茶', '起司蛋糕'])
    expect(refetches(), '還有伯爵紅茶在進行，不要重抓').toBe(before)
    await reject(setCall(4))
    expect(shown(), '伯爵紅茶失敗，改回未收藏').toEqual(['美式咖啡', '起司蛋糕'])
    expect(refetches(), '最後一個結束了（就算是失敗）要重抓一次：不能把重抓整個拿掉，也不能用 isMutating() === 0（onSettled 執行時自己還算在裡面）').toBe(before + 1)
    await resolvePending(api, 'getFavorites')
    expect(shown()).toEqual(['美式咖啡', '起司蛋糕'])
    expect(api.server.favorites.toSorted(), '（伺服器上：美式咖啡、起司蛋糕）').toEqual([1, 6])
  })
})
