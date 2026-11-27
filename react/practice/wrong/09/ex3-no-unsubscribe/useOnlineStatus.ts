import { useSyncExternalStore } from 'react'

// 錯在：取消訂閱時只移除 online，offline 的監聽留著
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => window.removeEventListener('online', onChange)
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
