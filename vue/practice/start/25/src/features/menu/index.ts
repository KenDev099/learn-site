// 練習 1：menu feature 的公開介面
// 外面的程式只能 import 這個檔案，menu 資料夾裡的其他檔案都是內部實作。
// 問題：formatPrice 是跟業務無關的通用工具，卻放在 menu 的公開介面；cart 為了它 import menu，
//       等你把 menu → cart 的 import 改對之後，menu 和 cart 會互相 import（循環依賴）。
export { default as MenuList } from './MenuList.vue'

export function formatPrice(n: number): string {
  return `${n.toLocaleString('zh-TW')} 元`
}
