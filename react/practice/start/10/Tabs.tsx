// 練習 3：Tabs（compound components）
// 問題：菜單頁要用分頁切換「咖啡／茶／點心」。現在的 Tabs 只是把 children 原樣排出來：
//       沒有「目前選中哪一個」的 state，三個 Panel 同時顯示，按 Tab 也沒反應。
// 用法（測試就是這樣用）：
//   <Tabs defaultValue="coffee">
//     <Tabs.List>
//       <Tabs.Tab value="coffee">咖啡</Tabs.Tab>
//       <Tabs.Tab value="tea">茶</Tabs.Tab>
//     </Tabs.List>
//     <Tabs.Panel value="coffee">…</Tabs.Panel>
//     <Tabs.Panel value="tea">…</Tabs.Panel>
//   </Tabs>
// 要求：
//   1. Tabs 擁有 state「目前選中的 value」，初始值是 defaultValue；用 context 交給底下的 Tab 與 Panel
//   2. Tabs.Tab 是 <button type="button" role="tab">，選中的那個 aria-selected="true"、其他 "false"；按下去就選中它
//   3. Tabs.Panel 只有 value 等於目前選中的值時才 render <div role="tabpanel">，否則回傳 null
//   4. Tab、Panel 外面多包幾層 <div> 或別的元件也要能用；同一頁的兩個 <Tabs> 互不影響
//   5. Tab 或 Panel 沒有放在 <Tabs> 裡時丟出 Error，訊息要提到 <Tabs>
// 不能做的事：用 Children.map／cloneElement 把 props 塞給子元素；把選中的值放在模組層級的變數
import type { ReactNode } from 'react'

export function Tabs({ children }: { defaultValue: string; children: ReactNode }) {
  return <div className="tabs">{children}</div>
}

function List({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>
}

function Tab({ children }: { value: string; children: ReactNode }) {
  return <button type="button" role="tab">{children}</button>
}

function Panel({ children }: { value: string; children: ReactNode }) {
  return <div role="tabpanel">{children}</div>
}

Tabs.List = List
Tabs.Tab = Tab
Tabs.Panel = Panel
