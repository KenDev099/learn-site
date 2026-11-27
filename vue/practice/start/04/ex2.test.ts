import { describe, expect, test } from 'vitest'
import { isReactive, isShallow, watch } from 'vue'
import { createMenuBoard, type MenuRow } from './ex2.ts'

const NAMES = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
const PRICES = [80, 110, 110, 90, 70, 120]
const makeRows = (n: number): MenuRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: NAMES[i % 6], price: PRICES[i % 6], soldOut: false }))

// 記錄 rows 被通知了幾次（flush: 'sync' 讓每次改動立刻呼叫，方便計數）
function watchRows(board: ReturnType<typeof createMenuBoard>) {
  const seen: MenuRow[][] = []
  watch(board.rows, value => { seen.push(value) }, { flush: 'sync' })
  return seen
}

describe('練習 2：用 shallowRef 管理大量品項', () => {
  test('品項物件不被轉成 proxy', () => {
    const board = createMenuBoard(makeRows(5000))
    expect(isShallow(board.rows), 'rows 不是 shallowRef：用 shallowRef(initial) 建立，不要用 ref 加 markRaw 之類的替代寫法').toBe(true)
    expect(isReactive(board.rows.value), '陣列被轉成 proxy 了：rows 要用 shallowRef').toBe(false)
    expect(isReactive(board.rows.value[0]), '品項被轉成 proxy 了：rows 要用 shallowRef').toBe(false)
  })

  test('replaceAll() 通知一次，換成新的陣列', () => {
    const board = createMenuBoard(makeRows(5000))
    const seen = watchRows(board)
    const next = makeRows(3)
    board.replaceAll(next)
    expect(seen.length, 'replaceAll 之後 watch 要剛好觸發一次').toBe(1)
    expect(board.rows.value, 'replaceAll 要直接把傳進來的陣列指定給 rows.value，不用複製').toBe(next)
  })

  test('markSoldOut() 通知一次，產生新陣列與新的那一筆', () => {
    const board = createMenuBoard(makeRows(5000))
    const seen = watchRows(board)
    const before = board.rows.value
    board.markSoldOut(2)
    expect(seen.length, 'markSoldOut 之後 watch 沒有觸發：shallowRef 只在 .value 被換掉時通知，要指定一個新陣列給 rows.value').toBe(1)
    expect(board.rows.value, '要產生新的陣列，不能沿用舊的').not.toBe(before)
    expect(board.rows.value[1]).toEqual({ id: 2, name: '拿鐵', price: 110, soldOut: true })
    board.markSoldOut(4)
    expect(seen.length, '第二次 markSoldOut 也要觸發').toBe(2)
    expect(board.rows.value.filter(r => r.soldOut).map(r => r.id)).toEqual([2, 4])
  })

  test('不修改原本的物件，其他品項沿用原本的物件', () => {
    const initial = makeRows(5000)
    const board = createMenuBoard(initial)
    const latte = initial[1]
    board.markSoldOut(2)
    expect(latte.soldOut, '原本的拿鐵物件被改到了：要用 { ...row, soldOut: true } 產生新物件').toBe(false)
    expect(initial[1], '原本的陣列被改到了：要產生新的陣列').toBe(latte)
    expect(board.rows.value[1], '售完的那一筆要是新物件').not.toBe(latte)
    expect(board.rows.value[0], '沒有變的品項要沿用原本的物件，不用整份複製').toBe(initial[0])
    expect(board.rows.value[4999]).toBe(initial[4999])
  })

  test('用 id 找品項，不依賴陣列位置', () => {
    const board = createMenuBoard(makeRows(6))
    const next: MenuRow[] = [
      { id: 10, name: '可頌', price: 70, soldOut: false },
      { id: 3, name: '卡布奇諾', price: 110, soldOut: false },
      { id: 7, name: '起司蛋糕', price: 120, soldOut: false },
    ]
    board.replaceAll(next)
    board.markSoldOut(3)
    expect(board.rows.value.map(r => r.soldOut), 'markSoldOut(3) 要把 id 是 3 的品項標成售完：用 r.id === id 找，不能用 id 當陣列位置').toEqual([false, true, false])
    expect(next[1].soldOut, '原本的物件被改到了').toBe(false)
    expect(isReactive(board.rows.value[0]), '換過陣列之後品項還是不能被轉成 proxy：rows 要用 shallowRef').toBe(false)
  })
})
