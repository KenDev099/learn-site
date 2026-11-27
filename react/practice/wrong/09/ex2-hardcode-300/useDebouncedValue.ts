import { useEffect, useState } from 'react'

// 錯在：時間寫死 300，沒用 delayMs
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300)
    return () => clearTimeout(timer)
  }, [value])
  void delayMs
  return debounced
}
