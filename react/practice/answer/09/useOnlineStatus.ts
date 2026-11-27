import { useSyncExternalStore } from 'react'

// 宣告在 hook 外面：每次 render 都是同一個函式，React 不會重新訂閱
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,   // 瀏覽器：目前的連線狀態
    () => true,               // 伺服器：不知道，先當作有連線
  )
}
