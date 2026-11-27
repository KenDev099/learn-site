import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}
const getSnapshot = () => navigator.onLine

// 錯在：getServerSnapshot 也讀 navigator.onLine（伺服器上沒有使用者的連線狀態）
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
