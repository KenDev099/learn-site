import { useEffect, useState } from 'react'

// 錯在：沒有依賴陣列，任何一次重新 render 都讓計時重來
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  })
  return debounced
}
