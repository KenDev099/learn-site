import { describe, expect, test } from 'vitest'
import { isReactive, reactive, watch } from 'vue'
import { ReceiptPrinter, useCheckout } from './ex3.ts'

describe('練習 3：有 #private 欄位的類別實例不能變成 proxy', () => {
  test('state.printer.print() 可以直接呼叫', () => {
    const { state } = useCheckout()
    expect(state.printer, 'state 裡要有 printer').toBeInstanceOf(ReceiptPrinter)
    let message = ''
    expect(() => { message = state.printer.print('#12') },
      'state.printer.print() 丟錯了：printer 被轉成 proxy，方法裡的 this 是 proxy，讀不到 #queue。建立時用 markRaw()').not.toThrow()
    expect(message).toBe('已送出 #12（第 1 張）')
  })

  test('printer 不是 proxy', () => {
    const { state } = useCheckout()
    expect(isReactive(state.printer), 'printer 不能被轉成 proxy').toBe(false)
    expect(Object.isExtensible(state.printer), '不要用 Object.freeze／seal／preventExtensions 擋掉 proxy：第三方實例會因此不能新增或修改欄位，用 markRaw()').toBe(true)
  })

  test('ReceiptPrinter 類別維持原樣', () => {
    const printer = new ReceiptPrinter()
    expect(isReactive(reactive({ printer }).printer), 'ReceiptPrinter 被改過了（例如在 constructor 裡 markRaw(this)）：它是第三方類別，不能改，要在 useCheckout() 建立實例的地方 markRaw').toBe(true)
    expect(printer.print('#1')).toBe('已送出 #1（第 1 張）')
  })

  test('checkout() 正常，而且 state.status 仍然是響應式', () => {
    const { state, checkout } = useCheckout()
    const seen: string[] = []
    watch(() => state.status, s => { seen.push(s) }, { flush: 'sync' })
    expect(checkout('#12')).toBe('已送出 #12（第 1 張）')
    expect(checkout('#13')).toBe('已送出 #13（第 2 張）')
    expect(state.printer.print('#14'), 'checkout() 要用 state.printer 這一台印表機，不能另外建一台').toBe('已送出 #14（第 3 張）')
    expect(seen, 'watch 沒有收到 status 的變化：state 本身仍然要是 reactive，只有 printer 不轉成 proxy').toEqual(['printing', 'done', 'printing', 'done'])
  })
})
