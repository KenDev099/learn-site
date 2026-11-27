import { useSyncExternalStore } from 'react'

// 錯在：subscribe 寫在 hook 裡面，每次 render 都是新的函式，React 每次都重新訂閱
export function useOnlineStatus(): boolean {
  function subscribe(onChange: () => void) {
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('offline', onChange)
    }
  }
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
