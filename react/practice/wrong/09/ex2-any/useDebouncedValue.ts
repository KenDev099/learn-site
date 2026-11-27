import { useEffect, useState } from 'react'

// 錯在：用 any，呼叫端拿不到型別
export function useDebouncedValue(value: any, delayMs: number): any {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
