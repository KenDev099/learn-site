// 練習 3：部署新版後載入不到 chunk（vite:preloadError）
// 問題：客人開著點餐頁，這時部署了新版，舊的 chunk 檔被刪掉；客人點「結帳」時懶載入結帳頁失敗，畫面沒反應。
//       第一版的修正是「失敗就 reload()」，結果 CDN 還沒更新完的那幾秒，頁面不停重新整理。
// 要求：handlePreloadError(event, { storage, reload, now })，正式環境這樣接：
//   window.addEventListener('vite:preloadError', (e) => handlePreloadError(e, { storage: sessionStorage, reload: () => location.reload(), now: Date.now }))
//   1. 第一次發生：event.preventDefault()（錯誤不再丟出），把現在的時間（now()）存進 storage，然後 reload()
//   2. 上次因為這個原因重新整理還不到 10 秒，又發生：不要 preventDefault、不要 reload，
//      讓錯誤照常丟出，畫面由錯誤處理顯示「請重新整理」
//   3. 超過 10 秒之後又發生（例如又部署了一次）：跟第一次一樣處理
//   4. 時間只能記在 storage：重新整理之後，模組裡的變數全部從頭開始
//   5. storage 讀寫丟出錯誤時（例如瀏覽器禁止儲存）：記不住時間就可能無限重新整理，所以不要 preventDefault、不要 reload
export type PreloadDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  now: () => number
}

const KEY = 'preload-error-reloaded-at'
const WINDOW_MS = 10_000

export function handlePreloadError(event: Event, deps: PreloadDeps): void {
  const t = deps.now()
  try {
    const last = Number(deps.storage.getItem(KEY))
    if (t - last < WINDOW_MS) return
  } catch {
    return
  }
  event.preventDefault()
  deps.reload()
}
