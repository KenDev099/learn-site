// 練習 3：結帳與收據印表機
// 問題：ReceiptPrinter 用 #queue 私有欄位，放進 reactive 之後，state.printer.print('#12') 會丟 TypeError
// 要求：printer 不能被轉成 proxy，state.printer.print() 要能直接呼叫；state.status 仍然要是響應式
import { reactive } from 'vue'

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
  const state = reactive({
    status: 'idle' as CheckoutStatus,
    // markRaw：這個物件永遠不會被轉成 proxy，方法裡的 this 是原本的實例
    printer: Object.preventExtensions(new ReceiptPrinter()),
  })

  function checkout(orderNo: string) {
    state.status = 'printing'
    const message = state.printer.print(orderNo)
    state.status = 'done'
    return message
  }

  return { state, checkout }
}
