// 練習 2：5000 筆品項的菜單看板
// 問題：用 ref 存整個陣列，Vue 會把每一筆品項都包成 proxy；售完時又直接改原本的物件
// 要求：
//   1. rows 改用 shallowRef：品項物件保持原樣，不被轉成 proxy
//   2. replaceAll(next)：整個換成新的陣列
//   3. markSoldOut(id)：產生新的陣列，被售完的那一筆換成新物件（soldOut: true），其他品項沿用原本的物件；不能修改任何原本的物件
import { shallowRef } from 'vue'

export type MenuRow = { id: number; name: string; price: number; soldOut: boolean }

export function createMenuBoard(initial: MenuRow[]) {
  // 只追蹤 .value 本身：換掉整個陣列才會通知
  const rows = shallowRef(initial)

  function replaceAll(next: MenuRow[]) {
    rows.value = next
  }

  function markSoldOut(id: number) {
    rows.value = structuredClone(rows.value).map(r => (r.id === id ? { ...r, soldOut: true } : r))
  }

  return { rows, replaceAll, markSoldOut }
}
