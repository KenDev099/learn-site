import { useSyncExternalStore } from 'react'

// 錯在：add 和 remove 傳的不是同一個函式，移除不掉
function subscribe(onChange: () => void) {
  window.addEventListener('online', () => onChange())
  window.addEventListener('offline', () => onChange())
  return () => {
    window.removeEventListener('online', () => onChange())
    window.removeEventListener('offline', () => onChange())
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
