import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { redactPII } from './ex2.ts'

const none = { phone: 0, email: 0, card: 0 }

test('台灣手機：三種寫法都遮蔽', () => {
  for (const phone of ['0912345678', '0912-345-678', '0912 345 678']) {
    const r = redactPII(`我的電話是 ${phone}，謝謝`)
    assert.equal(r.text, '我的電話是 [電話]，謝謝', `${phone} 要換成 [電話]（中間可以有 - 或空白）`)
    assert.deepEqual(r.found, { ...none, phone: 1 }, 'found.phone 要是 1，其他是 0')
  }
})

test('同一段裡的每一個都要遮蔽', () => {
  const r = redactPII('王小明 0912-345-678、陳美華 0922-111-222、林志豪 0933 222 333')
  assert.equal(r.text, '王小明 [電話]、陳美華 [電話]、林志豪 [電話]', '三支電話都要換掉：正規表示式要加 g')
  assert.equal(r.found.phone, 3, 'found.phone 要是 3')
})

test('Email', () => {
  const r = redactPII('收據寄到 a.b+c@shop.tw 或 Ming_Wang@mail.example.com')
  assert.equal(r.text, '收據寄到 [Email] 或 [Email]', 'Email 要換成 [Email]（帳號可以有 . + _，網域可以有多段）')
  assert.deepEqual(r.found, { ...none, email: 2 })
})

test('卡號：通過 Luhn 才遮蔽，訂單編號不能被誤遮', () => {
  const r = redactPII('卡號 4111 1111 1111 1111，另一張 5555-5555-5555-4444，AE 是 378282246310005')
  assert.equal(r.text, '卡號 [卡號]，另一張 [卡號]，AE 是 [卡號]', '13～19 碼、可以有空白或 - 的卡號要換成 [卡號]')
  assert.deepEqual(r.found, { ...none, card: 3 })
  const order = redactPII('訂單編號 2026102512345678，取餐號碼 1234567890123456')
  assert.equal(order.text, '訂單編號 2026102512345678，取餐號碼 1234567890123456', '這兩個 16 碼數字不通過 Luhn 檢查，不是卡號，要保持原樣（不然客服會看不到訂單編號）')
  assert.deepEqual(order.found, none, '沒有遮蔽任何東西時 found 全是 0')
})

test('卡號長度 13～19 碼都要處理', () => {
  const r = redactPII('舊卡 4222222222222，新卡 6011-0009-9013-9424-009')
  assert.equal(r.text, '舊卡 [卡號]，新卡 [卡號]', '13 碼與 19 碼、通過 Luhn 的卡號也要遮蔽：長度範圍是 13～19，不只 15、16 碼')
  assert.deepEqual(r.found, { ...none, card: 2 })
})

test('不能從更長的數字中間切一段出來', () => {
  const s = '訂單編號 1009123456708，會員條碼 41111111111111111107'
  const r = redactPII(s)
  assert.equal(r.text, s, '1009123456708 中間有 0912345670；41111111111111111107 是 20 碼，前 19 碼剛好通過 Luhn。兩串都不是電話或卡號：數字串前後要用 (?<!\\d)、(?!\\d) 確認沒有接著別的數字')
  assert.deepEqual(r.found, none)
})

test('價格、日期、短數字不能被誤判', () => {
  const s = '拿鐵 110 元、起司蛋糕 120 元，2026-10-25 下午 3 點取餐，桌號 12'
  const r = redactPII(s)
  assert.equal(r.text, s, '一般的數字不是個資，保持原樣')
  assert.deepEqual(r.found, none)
})

test('混在一起：各自計數', () => {
  const r = redactPII('請打 0955-666-777 或寫信到 yating@mail.example，刷卡 4012 8888 8888 1881，電話也可以打 0966777888')
  assert.equal(r.text, '請打 [電話] 或寫信到 [Email]，刷卡 [卡號]，電話也可以打 [電話]')
  assert.deepEqual(r.found, { phone: 2, email: 1, card: 1 }, 'found 要分別算出每一類被換掉的次數')
})
