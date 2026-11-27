import { describe, expect, test } from 'vitest'
import { isProxy, isReactive, isShallow, watch, watchEffect } from 'vue'
import { useSalesReport, type Sale } from './useSalesReport.ts'

function makeSales(n: number, storeOf: (i: number) => number): Sale[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    storeId: storeOf(i),
    productId: (i % 6) + 1,
    amount: 70 + (i % 6) * 10,
    soldAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
  }))
}

describe('練習 2：大量唯讀資料用 shallowRef', () => {
  test('2 萬筆資料不轉成 proxy', () => {
    const report = useSalesReport()
    const data = makeSales(20000, i => (i % 2) + 1)
    report.load(data)
    expect(report.rows.value.length).toBe(20000)
    expect(isShallow(report.rows), 'rows 要用 shallowRef 建立').toBe(true)
    expect(isReactive(report.rows.value[0]), 'rows.value[0] 不能是 reactive：深層的 ref 會把每一筆都包成 proxy').toBe(false)
    expect(isProxy(report.rows.value), '陣列本身也不需要是 proxy').toBe(false)
  })

  test('load 整批替換，watch 每次都觸發', () => {
    const report = useSalesReport()
    let runs = 0
    const sameArray: boolean[] = []
    const stop = watch(report.rows, (now, before) => { runs++; sameArray.push(now === before) }, { flush: 'sync' })
    report.load(makeSales(10, () => 1))
    report.load(makeSales(20, () => 2))
    stop()
    expect(runs, '每次 load 都要觸發依賴 rows 的 watch：shallowRef 只追蹤 .value 的替換，就地修改陣列（push、splice）不會通知任何人').toBe(2)
    expect(sameArray, '每次 load 後 rows.value 要換成另一個陣列（rows.value = data）：就地修改同一個陣列再 triggerRef，watch 拿到的新舊值是同一個陣列，下游無法比較').toEqual([false, false])
    expect(report.rows.value.length, '第二次 load 之後是新的 20 筆').toBe(20)
  })

  test('依門市篩選', () => {
    const report = useSalesReport()
    const data = makeSales(9, i => (i % 3 === 0 ? 2 : 1))
    report.load(data)
    expect(report.filtered.value.map(s => s.id), 'store 是 null 時回傳全部').toEqual(data.map(s => s.id))
    report.store.value = 2
    expect(report.filtered.value.map(s => s.id), 'store 是 2 時只留分店的資料，順序不變').toEqual([1, 4, 7])
    report.store.value = 1
    expect(report.filtered.value.map(s => s.id)).toEqual([2, 3, 5, 6, 8, 9])
  })

  test('篩選結果相同時，下游不重算', () => {
    const report = useSalesReport()
    report.load(makeSales(100, () => 1))   // 全部都是總店
    let runs = 0
    const stop = watchEffect(() => { void report.filtered.value; runs++ }, { flush: 'sync' })
    expect(runs).toBe(1)
    const before = report.filtered.value
    report.store.value = 1   // 「全部」和「總店」的結果完全一樣
    expect(report.filtered.value, '結果的元素和上一次完全相同時，要回傳上一次的陣列：computed((old) => …) 的參數就是上一次的值').toBe(before)
    expect(runs, '回傳同一個陣列，Vue 3.4 起依賴 filtered 的 effect 就不會重新執行').toBe(1)
    report.store.value = 2   // 結果變成空陣列，要通知下游
    expect(report.filtered.value.length).toBe(0)
    expect(runs, '結果真的改變時，下游要重新執行：不能永遠回傳舊陣列').toBe(2)
    report.load(makeSales(100, () => 2))
    expect(report.filtered.value.length, '換了資料要重新篩選').toBe(100)
    expect(runs).toBe(3)
    const next = makeSales(100, () => 2)   // 筆數、id 都一樣，但是是新的物件
    report.load(next)
    expect(report.filtered.value[0], '比較時要逐一比對元素是不是同一個物件（===）：只比長度或 id，換了新資料仍會回傳舊陣列').toBe(next[0])
    expect(runs, '資料換成新的物件，結果就是變了，下游要重新執行').toBe(4)
    stop()
  })
})
