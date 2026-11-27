// 自訂錯誤：菜單上找不到這個品項
export class UnknownItemError extends Error {
  itemName: string
  constructor(itemName: string) {
    super(`菜單上沒有「${itemName}」`)
    this.name = 'UnknownItemError'
    this.itemName = itemName
  }
}
