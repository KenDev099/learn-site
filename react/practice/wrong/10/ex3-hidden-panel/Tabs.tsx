import { createContext, use, useState, type ReactNode } from 'react'

type TabsContextValue = { value: string; select: (value: string) => void }

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(name: string) {
  const tabs = use(TabsContext)
  if (!tabs) throw new Error(`<Tabs.${name}> 要放在 <Tabs> 裡面`)
  return tabs
}

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <TabsContext value={{ value, select: setValue }}>
      <div className="tabs">{children}</div>
    </TabsContext>
  )
}

function List({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>
}

function Tab({ value, children }: { value: string; children: ReactNode }) {
  const tabs = useTabs('Tab')
  return (
    <button type="button" role="tab" aria-selected={tabs.value === value} onClick={() => tabs.select(value)}>
      {children}
    </button>
  )
}

function Panel({ value, children }: { value: string; children: ReactNode }) {
  const tabs = useTabs('Panel')
  return <div role="tabpanel" hidden={tabs.value !== value}>{children}</div>
}

Tabs.List = List
Tabs.Tab = Tab
Tabs.Panel = Panel
