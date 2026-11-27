import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// 錯在：getSnapshot 寫死 true
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => true)
}
