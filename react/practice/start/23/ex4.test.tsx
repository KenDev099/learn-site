import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { cleanup } from '@testing-library/react'
import { RemovableCart, type CartItem, type RemovableCartProps } from './RemovableCart.tsx'
import { checkRemovableCart } from './ex4.checks.tsx'

// 正確版本 B：計時器放在 effect 裡（pending 一變就重設）、清單用 aria-labelledby 命名、提示文字不同
// 改動旗標的預設值就是某一種錯誤版本；名稱都叫 RemovableCart
function variant({
  waitBeforeRemove = true, delay = 5000, undoCancels = true, restoreOnUndo = true, hideToast = true, passId = true,
} = {}): ComponentType<RemovableCartProps> {
  return function RemovableCart({ items, onRemove }: RemovableCartProps) {
    const [pending, setPending] = useState<CartItem | null>(null)
    const [gone, setGone] = useState<number[]>([])
    const [lingering, setLingering] = useState<CartItem | null>(null)
    const startedAt = useRef(0)
    const send = (item: CartItem) => onRemove(passId ? item.id : (item as unknown as number))

    useEffect(() => {
      if (!pending) return
      const t = setTimeout(() => {
        setGone(g => [...g, pending.id])
        setPending(null)
        if (!hideToast) setLingering(pending)
        if (waitBeforeRemove) send(pending)
      }, delay)
      return () => clearTimeout(t)
    }, [pending])   // eslint-disable-line react-hooks/exhaustive-deps

    function remove(item: CartItem) {
      if (pending) {
        setGone(g => [...g, pending.id])
        if (waitBeforeRemove) send(pending)
      }
      if (!waitBeforeRemove) send(item)   // 按下就真的刪除
      startedAt.current = Date.now()
      setLingering(null)
      setPending(item)
    }

    function undo() {
      if (!pending) return
      if (!undoCancels) {
        const item = pending
        setTimeout(() => send(item), delay - (Date.now() - startedAt.current))   // 原本的計時器沒取消
      }
      if (!restoreOnUndo) setGone(g => [...g, pending.id])
      setPending(null)
    }

    return (
      <div>
        <h2 id="cart-title">購物車</h2>
        <ul aria-labelledby="cart-title">
          {items.filter(i => i.id !== pending?.id && !gone.includes(i.id)).map(i => (
            <li key={i.id}>{i.name}<button aria-label={`移除${i.name}`} onClick={() => remove(i)}>移除</button></li>
          ))}
        </ul>
        {pending && <div role="status">{pending.name} 已從購物車拿掉，<button onClick={undo}>復原</button></div>}
        {lingering && <div role="status">{lingering.name} 已拿掉</div>}
      </div>
    )
  }
}

const WRONG: [string, ComponentType<RemovableCartProps>][] = [
  ['按下移除就立刻呼叫 onRemove', variant({ waitBeforeRemove: false })],
  ['4 秒就呼叫 onRemove', variant({ delay: 4000 })],
  ['8 秒才呼叫 onRemove', variant({ delay: 8000 })],
  ['按復原沒有取消計時器，時間到還是刪除', variant({ undoCancels: false })],
  ['按復原之後品項沒有回到清單', variant({ restoreOnUndo: false })],
  ['刪除之後提示一直留著', variant({ hideToast: false })],
  ['onRemove 收到整個品項物件，不是 id', variant({ passId: false })],
]

async function run(Cart: ComponentType<RemovableCartProps>) {
  try {
    await checkRemovableCart(Cart)
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e)
  } finally {
    cleanup()
    vi.useRealTimers()
  }
}

// 正確的檢查用假計時器，幾毫秒就跑完；等真的 5 秒、或 userEvent 卡在假計時器上，會在 2 秒時被判為逾時
describe('練習 4：可以復原的移除的檢查', () => {
  test('正確版本 A（RemovableCart.tsx）要通過', async () => {
    const error = await run(RemovableCart)
    expect(error, `你的檢查在正確版本 A 上丟錯：${error}。推進假計時器要包在 act(() => { … }) 裡，畫面才會更新`).toBeNull()
  }, 2000)

  test('正確版本 B（計時器寫在 effect 裡、文字不同）要通過', async () => {
    const error = await run(variant())
    expect(error, `你的檢查在正確版本 B 上丟錯：${error}`).toBeNull()
  }, 2000)

  test.each(WRONG)('錯誤版本「%s」要被抓到', async (name, Cart) => {
    const error = await run(Cart)
    expect(error, `錯誤版本「${name}」通過了你的檢查：補上能抓到這個問題的 expect`).not.toBeNull()
  }, 2000)

  test('不等真實的時間', () => {
    const code = readFileSync(join(import.meta.dirname, 'ex4.checks.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/new Promise[^;]*setTimeout/.test(code), '用真的 setTimeout 等 5 秒：測試變慢又不精準。用 vi.useFakeTimers() 加 vi.advanceTimersByTime()').toBe(false)
  })
})
