// 練習 3：結帳與收據印表機
// 問題：ReceiptPrinter 用 #queue 私有欄位，放進 reactive 之後，state.printer.print('#12') 會丟 TypeError
// 要求：printer 不能被轉成 proxy，state.printer.print() 要能直接呼叫；state.status 仍然要是響應式
import { markRaw } from 'vue'

// 假裝這是第三方套件提供的類別：不能改它
export class ReceiptPrinter {
  #queue: string[] = []

  print(orderNo: string) {
    this.#queue.push(orderNo)
    return `已送出 ${orderNo}（第 ${this.#queue.length} 張）`
  }
}

export type CheckoutStatus = 'idle' | 'printing' | 'done'

export function useCheckout() {
  const state = markRaw({
    status: 'idle' as CheckoutStatus,
    printer: new ReceiptPrinter(),
  })

  function checkout(orderNo: string) {
    state.status = 'printing'
    const message = state.printer.print(orderNo)
    state.status = 'done'
    return message
  }

  return { state, checkout }
}
