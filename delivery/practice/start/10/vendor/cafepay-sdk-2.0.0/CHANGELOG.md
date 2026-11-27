# Changelog

版本規則照 [Semantic Versioning](https://semver.org/)：主版號（第一個數字）增加代表有破壞性變更。

## 2.0.0 (2026-10-20)

### ⚠ BREAKING CHANGES

- **金額改用最小貨幣單位的整數。** `payments.create()` 的 `amount` 與回傳的 `Payment.amount` 都是「分」：新台幣 110 元要傳 `11000`。不是整數的金額會被 API 拒絕（`invalid_request`）。
- **`createPayment(input, { idempotencyKey })` 移除，改用 `payments.create(params)`。** `idempotencyKey` 從第二個參數移進 `params`。`findPayment(orderId)` 保留，但受下面兩點影響。
- **錯誤改為丟出 `CafePayError`。** 1.x 的方法一律回傳 `{ ok: true, payment }` 或 `{ ok: false, error }`；2.0 成功時直接回傳 `Payment`，失敗時丟出 `CafePayError`（`code` 等於 1.x 的 `error.type`，另有 `status`、`paymentId`）。`findPayment()` 查無付款時也會丟出（`code: 'not_found'`）。

### Features

- 改呼叫 CafePay API 的 `/v2` 端點。

### 1.x 的支援

- 1.x 只修安全性問題到 **2027-02-01**，之後 CafePay API 的 `/v1` 端點停止服務。

### 從 1.x 升級

| 1.x | 2.0 |
|---|---|
| `await cafepay.createPayment({ orderId, amount: 110, cardToken }, { idempotencyKey })` | `await cafepay.payments.create({ orderId, amount: 11000, cardToken, idempotencyKey })` |
| `if (!r.ok) { switch (r.error.type) … }`、`r.payment` | `try { … } catch (e) { if (e instanceof CafePayError) switch (e.code) … }`，成功直接拿回傳值 |
| `r.payment.amount`（元） | `payment.amount`（分） |

Webhook 的格式不受 SDK 版本影響（`data.amount` 仍然是元）。

## 1.4.2 (2026-08-04)

### Bug Fixes

- 逾時之後沒有釋放連線。

## 1.4.1 (2026-06-30)

### Bug Fixes

- `findPayment()` 的 `orderId` 沒有做 URL 編碼。

## 1.4.0 (2026-05-12)

### Features

- 新增 `findPayment(orderId)`。
- 錯誤多了 `status`（CafePay 回的 HTTP 狀態碼）。
