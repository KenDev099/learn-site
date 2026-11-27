import { useEffect, useState } from 'react'

// 錯在：useState + useEffect 自己同步：render 到訂閱之間的改變會漏掉，伺服器端也照 navigator.onLine
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
