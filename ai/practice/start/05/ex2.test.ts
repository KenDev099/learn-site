import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type { OrderIntent } from './ex1.ts'
import { toOrder, type MenuItem } from './ex2.ts'

const MENU: MenuItem[] = [
  { name: '美式咖啡', price: 80, available: true },
  { name: '拿鐵', price: 110, available: true },
  { name: '卡布奇諾', price: 110, available: true },
  { name: '伯爵紅茶', price: 90, available: true },
  { name: '可頌', price: 70, available: true },
  { name: '起司蛋糕', price: 120, available: false },   // 今天下架
]
const STOCK = { '美式咖啡': 50, '拿鐵': 3, '卡布奇諾': 10, '伯爵紅茶': 10, '可頌': 2 }
const order = (items: OrderIntent['items'], note: string | null = null): OrderIntent => ({ intent: 'order', items, note })

test('正常的訂單：價格從菜單來，total 是整數加總', () => {
  const r = toOrder(order([{ product: '拿鐵', quantity: 2 }, { product: '可頌', quantity: 1 }]), MENU, STOCK)
  assert.deepEqual(r, {
    ok: true,
    lines: [
      { product: '拿鐵', quantity: 2, unitPrice: 110, subtotal: 220 },
      { product: '可頌', quantity: 1, unitPrice: 70, subtotal: 70 },
    ],
    total: 290,
  })
})

test('換一份菜單價格也跟著變（不是寫死價格）', () => {
  const menu = MENU.map(m => m.name === '美式咖啡' ? { ...m, price: 85 } : m)
  const r = toOrder(order([{ product: '美式咖啡', quantity: 3 }]), menu, STOCK)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.total, 255, '美式咖啡改成 85 元，3 杯是 255：價格要從傳進來的 menu 拿')
})

test('同一個商品出現兩次：合併成一行，用合併後的數量檢查庫存', () => {
  const ok = toOrder(order([{ product: '美式咖啡', quantity: 1 }, { product: '可頌', quantity: 1 }, { product: '美式咖啡', quantity: 2 }]), MENU, STOCK)
  assert.deepEqual(ok, {
    ok: true,
    lines: [
      { product: '美式咖啡', quantity: 3, unitPrice: 80, subtotal: 240 },
      { product: '可頌', quantity: 1, unitPrice: 70, subtotal: 70 },
    ],
    total: 310,
  }, '同一個商品要合併成一行，順序依第一次出現')
  // 拿鐵只剩 3 杯：2＋2 = 4 杯不夠，分開看每行都夠
  const r = toOrder(order([{ product: '拿鐵', quantity: 2 }, { product: '拿鐵', quantity: 2 }]), MENU, STOCK)
  assert.equal(r.ok, false, '拿鐵剩 3 杯，兩行各 2 杯合計 4 杯：要先合併再檢查庫存')
})

test('模型輸出夾帶 price 欄位：一律忽略，用菜單價格', () => {
  const sneaky = { intent: 'order', items: [{ product: '拿鐵', quantity: 2, price: 1 }], note: null } as unknown as OrderIntent
  const r = toOrder(sneaky, MENU, STOCK)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.lines[0].unitPrice, 110, 'unitPrice 要用菜單的 110，不是模型給的 price')
    assert.equal(r.total, 220, '金額一律用資料庫（菜單）的價格計算')
  }
})

test('同時有兩個問題：全部列出（下架＋庫存不足）', () => {
  const r = toOrder(order([{ product: '起司蛋糕', quantity: 1 }, { product: '可頌', quantity: 5 }, { product: '美式咖啡', quantity: 1 }]), MENU, STOCK)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.errors.length, 2, `要列出全部的錯誤（起司蛋糕下架、可頌庫存不足），不是遇到第一個就停；你的 errors：${JSON.stringify(r.errors)}`)
    assert.ok(r.errors.some(e => e.includes('起司蛋糕')), '下架商品的錯誤訊息要包含商品名稱')
    assert.ok(r.errors.some(e => e.includes('可頌')), '庫存不足的錯誤訊息要包含商品名稱')
  }
})

test('stock 裡沒有這個商品：當成 0，不是無限', () => {
  const r = toOrder(order([{ product: '伯爵紅茶', quantity: 1 }]), MENU, { '拿鐵': 3 })
  assert.equal(r.ok, false, 'stock 沒有伯爵紅茶這個 key 時當成 0（stock[name] ?? 0），不能讓它通過')
  if (!r.ok) assert.ok(r.errors.some(e => e.includes('伯爵紅茶')))
})

test('下架的商品（available: false）就算還有庫存也要擋下', () => {
  const r = toOrder(order([{ product: '起司蛋糕', quantity: 1 }]), MENU, { ...STOCK, '起司蛋糕': 5 })
  assert.equal(r.ok, false, '起司蛋糕今天下架（available: false），冰箱裡還有 5 個也不能賣：要檢查 available')
  if (!r.ok) assert.ok(r.errors.some(e => e.includes('起司蛋糕')), '錯誤訊息要包含商品名稱')
})

test('菜單上沒有的商品要擋下', () => {
  const r = toOrder(order([{ product: '摩卡', quantity: 1 } as unknown as OrderIntent['items'][number]]), MENU, { '摩卡': 9 })
  assert.equal(r.ok, false, 'schema 有驗證不代表菜單上一定有：menu 找不到就是錯誤')
  if (!r.ok) assert.ok(r.errors.some(e => e.includes('摩卡')))
})

test('intent 不是 order（unclear、question）時 ok 是 false', () => {
  for (const intent of ['unclear', 'question'] as const) {
    const r = toOrder({ intent, items: [{ product: '拿鐵', quantity: 1 }], note: null }, MENU, STOCK)
    assert.equal(r.ok, false, `intent 是 ${intent} 時不能建立訂單，就算 items 有東西也一樣`)
    if (!r.ok) assert.ok(r.errors.length >= 1, 'errors 要說明原因')
  }
})

test('沒有任何品項的 order 不能成立', () => {
  assert.equal(toOrder(order([]), MENU, STOCK).ok, false, 'items 是空陣列時 ok 要是 false')
})

test('不改傳進來的資料', () => {
  const intent = order([{ product: '美式咖啡', quantity: 1 }, { product: '美式咖啡', quantity: 2 }])
  const before = structuredClone(intent)
  const stock = { ...STOCK }
  toOrder(intent, MENU, stock)
  assert.deepEqual(intent, before, '合併時不要改到傳進來的 intent')
  assert.deepEqual(stock, STOCK, '這裡只檢查庫存，不扣庫存（扣庫存是建立訂單的交易做的事）')
})
