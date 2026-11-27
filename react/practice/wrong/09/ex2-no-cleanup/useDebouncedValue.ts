import { useEffect, useState } from 'react'

// 錯在：沒有清理函式，每次輸入的計時器都會跑完
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    setTimeout(() => setDebounced(value), delayMs)
  }, [value, delayMs])
  return debounced
}
