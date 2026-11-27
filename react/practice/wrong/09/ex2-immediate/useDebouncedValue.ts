import { useEffect, useState } from 'react'

// 錯在：effect 裡直接 setState，沒有等
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    setDebounced(value)
  }, [value, delayMs])
  return debounced
}
