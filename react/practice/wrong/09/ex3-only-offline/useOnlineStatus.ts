import { useSyncExternalStore } from 'react'

// 錯在：只監聽 offline，恢復連線時不會更新
function subscribe(onChange: () => void) {
  window.addEventListener('offline', onChange)
  return () => window.removeEventListener('offline', onChange)
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
