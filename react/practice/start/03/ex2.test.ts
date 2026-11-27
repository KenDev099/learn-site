import { describe, expect, test } from 'vitest'
import { addItem, setNote, setPhone, setQuantity, sortByPrice, type Order } from './order.ts'
import { PRODUCTS } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

const product = (id: number) => PRODUCTS.find(p => p.id === id)!

// 每個測試都拿到一張凍結的訂單：改到它（或它裡面的物件、陣列）就會丟 TypeError
// 拿鐵 110 × 2、可頌 70 × 1、卡布奇諾 110 × 1
const makeOrder = (): Order => deepFreeze({
  customer: { name: '王小明', phone: '0912-345-678' },
  note: '',
  items: [
    { productId: 2, quantity: 2, unitPrice: 110 },
    { productId: 5, quantity: 1, unitPrice: 70 },
    { productId: 3, quantity: 1, unitPrice: 110 },
  ],
})

// 呼叫學習者的函式；改到凍結的訂單時，把 TypeError 換成看得懂的說明
function run(name: string, fn: () => Order): Order {
  try {
    return fn()
  } catch (e) {
    if (e instanceof TypeError) throw new Error(`${name} 改到了傳進來的 order（測試傳的是凍結的物件）：${e.message}。不能 mutate，要用展開、map、filter、toSorted 做出新的物件或陣列`)
    throw e
  }
}

describe('練習 2：訂單的不可變更新', () => {
  test('setNote 回傳新的 order，只有 note 不同', () => {
    const order = makeOrder()
    const next = run('setNote', () => setNote(order, '少冰'))
    expect(next, 'setNote 要回傳備註是「少冰」、其他不變的訂單').toEqual({ ...order, note: '少冰' })
    expect(next, 'setNote 要回傳新的物件：回傳同一個 order，React 會當成沒變').not.toBe(order)
    expect(next.items, 'items 沒有變，要沿用原本的陣列（next.items === order.items）：只複製有改到的那一層').toBe(order.items)
    expect(next.customer, 'customer 沒有變，要沿用原本的物件').toBe(order.customer)
  })

  test('setPhone 一路複製到 customer 這一層', () => {
    const order = makeOrder()
    const next = run('setPhone', () => setPhone(order, '0987-654-321'))
    expect(next, 'setPhone 要回傳 customer.phone 是新電話、其他不變的訂單').toEqual({ ...order, customer: { name: '王小明', phone: '0987-654-321' } })
    expect(next, 'setPhone 要回傳新的 order').not.toBe(order)
    expect(next.customer, 'customer 裡面有東西變了，customer 也要是新的物件').not.toBe(order.customer)
    expect(next.items, 'items 沒有變，要沿用原本的陣列').toBe(order.items)
  })

  test('addItem：已經有的商品，那一列數量加 1', () => {
    const order = makeOrder()
    const next = run('addItem', () => addItem(order, product(5)))
    expect(next.items, '可頌已經在訂單裡，要把那一列的數量從 1 變成 2，不能多一列').toEqual([
      { productId: 2, quantity: 2, unitPrice: 110 },
      { productId: 5, quantity: 2, unitPrice: 70 },
      { productId: 3, quantity: 1, unitPrice: 110 },
    ])
    expect(next.items, 'items 變了，要是新的陣列').not.toBe(order.items)
    expect(next.items[1], '數量變了的那一列要是新的物件').not.toBe(order.items[1])
    expect(next.items[0], '沒被改到的列要沿用原本的物件（用 map，只有符合的那一列回傳新物件）').toBe(order.items[0])
    expect(next.items[2], '沒被改到的列要沿用原本的物件').toBe(order.items[2])
    expect(next.customer, 'customer 沒有變，要沿用原本的物件').toBe(order.customer)
  })

  test('addItem：沒有的商品加到最後一列，單價用商品的價格', () => {
    const order = makeOrder()
    const next = run('addItem', () => addItem(order, product(4)))
    expect(next.items, '伯爵紅茶不在訂單裡，要加到最後：{ productId: 4, quantity: 1, unitPrice: 90 }').toEqual([
      ...order.items,
      { productId: 4, quantity: 1, unitPrice: 90 },
    ])
    expect(next.items, 'items 變了，要是新的陣列').not.toBe(order.items)
    expect(next.items.slice(0, 3).every((item, i) => item === order.items[i]), '原本的三列要沿用原本的物件').toBe(true)
  })

  test('addItem 連續呼叫：空訂單加兩次美式、一次起司蛋糕', () => {
    const empty: Order = deepFreeze({ customer: { name: '陳美華', phone: '' }, note: '', items: [] })
    const next = run('addItem', () => addItem(addItem(addItem(empty, product(1)), product(6)), product(1)))
    expect(next.items).toEqual([
      { productId: 1, quantity: 2, unitPrice: 80 },
      { productId: 6, quantity: 1, unitPrice: 120 },
    ])
    expect(empty.items, '傳進來的空訂單不能被改到').toEqual([])
  })

  test('setQuantity 改那一列的數量', () => {
    const order = makeOrder()
    const next = run('setQuantity', () => setQuantity(order, 3, 4))
    expect(next.items, '把卡布奇諾（productId 3）的數量改成 4').toEqual([
      { productId: 2, quantity: 2, unitPrice: 110 },
      { productId: 5, quantity: 1, unitPrice: 70 },
      { productId: 3, quantity: 4, unitPrice: 110 },
    ])
    expect(next.items[0], '沒被改到的列要沿用原本的物件').toBe(order.items[0])
    expect(next.items[2], '數量變了的那一列要是新的物件').not.toBe(order.items[2])
  })

  test('setQuantity 數量小於等於 0 就移除那一列', () => {
    const order = makeOrder()
    for (const quantity of [0, -1]) {
      const next = run('setQuantity', () => setQuantity(order, 5, quantity))
      expect(next.items, `數量 ${quantity} 要移除可頌那一列（用 filter），不能留一列數量 ${quantity} 的品項`).toEqual([order.items[0], order.items[2]])
      expect(next.items[0], '留下來的列要沿用原本的物件').toBe(order.items[0])
    }
    expect(order.items, '原本的訂單還是三列').toHaveLength(3)
  })

  test('sortByPrice 依單價由低到高，不動原本的陣列', () => {
    const order = makeOrder()
    const next = run('sortByPrice', () => sortByPrice(order))
    expect(next.items.map(i => i.productId), '依 unitPrice 由低到高：可頌 70、拿鐵 110、卡布奇諾 110（單價相同維持原本先後）').toEqual([5, 2, 3])
    expect(order.items.map(i => i.productId), '原本的 items 順序不能變：sort 會直接改原陣列，改用 toSorted 或先複製再排').toEqual([2, 5, 3])
    expect(next.items, 'items 的順序變了，要是新的陣列').not.toBe(order.items)
    expect(next.items.every(item => order.items.includes(item)), '排序只是換位置，每一列要沿用原本的物件').toBe(true)
    expect(next.customer, 'customer 沒有變，要沿用原本的物件').toBe(order.customer)
  })
})
