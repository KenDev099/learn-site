import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'

type Injected = { current?: string; onSelect?: (value: string) => void }

// 把 current、onSelect 塞給「直接的」子元素：中間多包一層就收不到
function inject(children: ReactNode, props: Injected) {
  return Children.map(children, child => (isValidElement(child) ? cloneElement(child as ReactElement<Injected>, props) : child))
}
function assertInside(name: string, onSelect: unknown) {
  if (!onSelect) throw new Error(`<Tabs.${name}> 要放在 <Tabs> 裡面`)
}

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue)
  return <div className="tabs">{inject(children, { current: value, onSelect: setValue })}</div>
}

function List({ children, current, onSelect }: { children: ReactNode } & Injected) {
  return <div role="tablist">{inject(children, { current, onSelect })}</div>
}

function Tab({ value, children, current, onSelect }: { value: string; children: ReactNode } & Injected) {
  assertInside('Tab', onSelect)
  return (
    <button type="button" role="tab" aria-selected={current === value} onClick={() => onSelect?.(value)}>
      {children}
    </button>
  )
}

function Panel({ value, children, current, onSelect }: { value: string; children: ReactNode } & Injected) {
  assertInside('Panel', onSelect)
  if (current !== value) return null
  return <div role="tabpanel">{children}</div>
}

Tabs.List = List
Tabs.Tab = Tab
Tabs.Panel = Panel
