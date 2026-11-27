// 櫃台叫號用的取餐號碼：A001、A002、…、A999，之後回到 A001（CAFE-23 叫號機；下一步才接到下單流程）
// 每次呼叫 createOrderNumbers() 都是一組獨立的號碼：狀態跟著物件走，不藏在模組裡，測試各自建立、互不影響
export function createOrderNumbers() {
  let last = 0
  return {
    next(): string {
      last = last % 999 + 1
      return `A${String(last).padStart(3, '0')}`
    },
    // 每天開店時歸零
    reset(): void {
      last = 0
    },
  }
}
