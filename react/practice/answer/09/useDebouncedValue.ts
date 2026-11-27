import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)   // value 或 delayMs 變了、元件卸載：清掉上一個計時器
  }, [value, delayMs])

  return debounced
}
