import { describe, expect, test } from 'vitest'
import { act, screen } from '@testing-library/react'
import { FavoriteButton } from './FavoriteButton.tsx'
import { reject, resolve, resolvePending, settle, setup } from './test-utils.tsx'

async function open(favorites: number[] = [], productId = 2, name = '拿鐵') {
  const t = setup(api => <FavoriteButton api={api} productId={productId} name={name} />, { favorites })
  await resolvePending(t.api, 'getFavorites')
  const button = () => screen.getByRole('button', { name: new RegExp(`收藏${name}`) })
  const click = async () => { await t.user.click(button()); await settle() }
  const refetches = () => t.api.callsOf('getFavorites').length
  return { ...t, button, click, refetches }
}

describe('練習 2：FavoriteButton 樂觀更新，失敗時回復', () => {
  test('按下去立刻變成已收藏，不等伺服器', async () => {
    const { api, button, click } = await open([])
    expect(button(), '一開始拿鐵沒有收藏').toHaveAttribute('aria-pressed', 'false')
    await click()
    expect(api.callsOf('setFavorite').map(c => c.args), '要呼叫 api.setFavorite(2, true)：true 是按下去之後要變成的狀態。沒有呼叫的話，檢查 onMutate 有沒有丟出錯誤：快取裡的陣列是凍結的，push、splice 會丟 TypeError，onMutate 失敗時 mutationFn 不會執行').toEqual([[2, true]])
    expect(api.pendingOf('setFavorite').length, '（測試本身：伺服器還沒回應）').toBe(1)
    expect(button(), '伺服器還沒回應，按鈕就要變成已收藏：在 onMutate 裡用 queryClient.setQueryData([\'favorites\'], …) 先改快取').toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('成功：維持已收藏，並重抓一次跟伺服器對齊', async () => {
    const { api, button, click, refetches } = await open([])
    const before = refetches()
    await click()
    await resolve(api.pendingOf('setFavorite')[0])
    expect(refetches(), '成功之後要讓 [\'favorites\'] 失效、重抓一次（onSettled 裡 invalidateQueries）').toBe(before + 1)
    await resolvePending(api, 'getFavorites')
    expect(button(), '重抓回來伺服器也是已收藏').toHaveAttribute('aria-pressed', 'true')
  })

  test('失敗：回到原本的狀態、顯示錯誤，並重抓一次', async () => {
    const { api, button, click, refetches } = await open([])
    const before = refetches()
    await click()
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    await reject(api.pendingOf('setFavorite')[0])
    expect(button(), '失敗了，伺服器沒有收藏，畫面卻還是已收藏：在 onMutate 回傳改之前的快取，onError 用它 setQueryData 改回去（不要等重抓，重抓可能要好幾秒）').toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('alert'), '失敗時要馬上顯示 <p role="alert">收藏失敗，請再試一次</p>（用 mutation.isError）。如果 onSettled 回傳了 invalidateQueries 的 Promise，mutation 要等重抓完才算失敗，錯誤就晚出現了：onSettled 裡呼叫就好，不要回傳').toHaveTextContent('收藏失敗，請再試一次')
    expect(refetches(), '失敗也要重抓一次跟伺服器對齊（請求可能其實已經在伺服器完成了）：invalidateQueries 放在 onSettled，不是只放 onSuccess').toBe(before + 1)
    await resolvePending(api, 'getFavorites')
    expect(button()).toHaveAttribute('aria-pressed', 'false')
  })

  test('取消收藏也一樣：立刻變成未收藏，失敗時改回已收藏', async () => {
    const { api, button, click } = await open([5, 2], 2, '拿鐵')
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    await click()
    expect(api.callsOf('setFavorite').map(c => c.args), '已收藏時按下去要呼叫 api.setFavorite(2, false)').toEqual([[2, false]])
    expect(button(), '取消收藏也要立刻反映在畫面上').toHaveAttribute('aria-pressed', 'false')
    await reject(api.pendingOf('setFavorite')[0])
    expect(button(), '取消收藏失敗，要改回已收藏').toHaveAttribute('aria-pressed', 'true')
  })

  test('進行中的舊重抓晚回來，不能蓋掉樂觀更新', async () => {
    const { api, client, button, click } = await open([], 4, '伯爵紅茶')
    act(() => { void client.invalidateQueries({ queryKey: ['favorites'] }) })   // 背景正在重抓（例如視窗重新聚焦）
    const stale = api.pendingOf('getFavorites')[0]
    expect(stale, '（測試本身：要有一個進行中的重抓）').toBeDefined()
    await click()
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    await resolve(stale)   // 舊的重抓回來了：伺服器那時還沒有收藏
    expect(button(), '按下去之前就在跑的重抓晚回來，把樂觀更新蓋掉了：onMutate 一開始先 await queryClient.cancelQueries({ queryKey: [\'favorites\'] })').toHaveAttribute('aria-pressed', 'true')
    await resolve(api.pendingOf('setFavorite')[0])
    await resolvePending(api, 'getFavorites')
    expect(button()).toHaveAttribute('aria-pressed', 'true')
  })

  test('別的商品也能用（不能寫死拿鐵）', async () => {
    const { api, button, click } = await open([2], 6, '起司蛋糕')
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    await click()
    expect(api.callsOf('setFavorite').map(c => c.args)).toEqual([[6, true]])
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    await reject(api.pendingOf('setFavorite')[0])
    expect(button(), '起司蛋糕收藏失敗要改回未收藏').toHaveAttribute('aria-pressed', 'false')
    await resolvePending(api, 'getFavorites')
    expect(api.server.favorites, '（伺服器上仍只有拿鐵）').toEqual([2])
  })
})
