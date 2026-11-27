import { useEffect, useState } from 'react'

// 錯在：依賴陣列漏了 delayMs
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}
