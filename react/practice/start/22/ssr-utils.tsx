// 測試共用（不用改）：在同一個 Vitest 程序裡模擬伺服器與瀏覽器兩端
// onServer：把 window、document、localStorage 拿掉，模擬伺服器上沒有瀏覽器 API（Node 裡讀它們會丟錯）
// hydrate：把伺服器的 HTML 放進容器，用 hydrateRoot 接手；收集 React 回報的 hydration 問題
//   recoverable：onRecoverableError 收到的錯誤（文字或節點不一致，React 丟掉伺服器的 DOM、在瀏覽器重新 render）
//   consoleErrors：console.error 印出的訊息（屬性不一致只印警告，不會修正）
import type { ReactNode } from 'react'
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot, type HydrationOptions, type Root } from 'react-dom/client'
import { vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export function onServer<T>(run: () => T): T {
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('document', undefined)
  vi.stubGlobal('localStorage', undefined)
  try {
    return run()
  } finally {
    vi.unstubAllGlobals()
  }
}

export const serverRender = (element: ReactNode) => onServer(() => renderToString(element))

export type HydrationReport = { recoverable: string[]; consoleErrors: string[] }

/** 執行 start（裡面呼叫 hydrateRoot），等 hydration 和之後的 effect 都跑完，回傳收集到的問題 */
export async function collectHydration(start: (options: HydrationOptions) => Root | void): Promise<HydrationReport & { root: Root | void }> {
  const recoverable: string[] = []
  const consoleErrors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '))
  })
  let root: Root | void = undefined
  try {
    await act(async () => {
      root = start({ onRecoverableError: e => { recoverable.push(e instanceof Error ? e.message : String(e)) } })
    })
  } finally {
    spy.mockRestore()
  }
  return { root, recoverable, consoleErrors }
}

export async function hydrate(html: string, element: ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  const report = await collectHydration(options => hydrateRoot(container, element, options))
  return { ...report, container }
}

/** 失敗訊息用：把收集到的問題縮成前幾行 */
export const summary = ({ recoverable, consoleErrors }: HydrationReport) =>
  [...recoverable, ...consoleErrors].map(m => m.split('\n')[0]).join('；')
