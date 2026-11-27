import { useSyncExternalStore, type ReactNode } from 'react'

// 選中的值放在模組層級：整頁所有 <Tabs> 共用同一份
let current: string | null = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const select = (value: string) => { current = value; listeners.forEach(fn => fn()) }

function useCurrent(name: string) {
  const value = useSyncExternalStore(subscribe, () => current)
  if (value === null) throw new Error(`<Tabs.${name}> 要放在 <Tabs> 裡面`)
  return value
}

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  if (current === null) current = defaultValue
  return <div className="tabs">{children}</div>
}

function List({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>
}

function Tab({ value, children }: { value: string; children: ReactNode }) {
  const selected = useCurrent('Tab')
  return (
    <button type="button" role="tab" aria-selected={selected === value} onClick={() => select(value)}>
      {children}
    </button>
  )
}

function Panel({ value, children }: { value: string; children: ReactNode }) {
  const selected = useCurrent('Panel')
  if (selected !== value) return null
  return <div role="tabpanel">{children}</div>
}

Tabs.List = List
Tabs.Tab = Tab
Tabs.Panel = Panel
