// 櫃台叫號用的取餐號碼：A001、A002、…、A999，之後回到 A001（CAFE-23 叫號機；下一步才接到下單流程）
let last = 0

export function nextOrderNumber(): string {
  last = last % 999 + 1
  return `A${String(last).padStart(3, '0')}`
}

// 每天開店時歸零
export function resetOrderNumbers(): void {
  last = 0
}
