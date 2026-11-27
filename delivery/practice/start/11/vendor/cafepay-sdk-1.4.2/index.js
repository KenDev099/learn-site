// cafepay-sdk 1.4.2：呼叫 CafePay API 的 /v1 端點。錯誤不會丟出，一律回傳 { ok: false, error }
export class CafePay {
  #baseUrl
  #timeoutMs

  constructor({ baseUrl, timeoutMs = 5000 }) {
    this.#baseUrl = baseUrl
    this.#timeoutMs = timeoutMs
  }

  createPayment(input, { idempotencyKey }) {
    return this.#request('/v1/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
  }

  findPayment(orderId) {
    return this.#request(`/v1/payments?orderId=${encodeURIComponent(orderId)}`, { method: 'GET' })
  }

  async #request(path, init) {
    let res
    try {
      res = await fetch(this.#baseUrl + path, { ...init, signal: AbortSignal.timeout(this.#timeoutMs) })
    } catch (e) {
      return { ok: false, error: { type: 'network', message: `CafePay 沒有回應（${e.name}）` } }
    }
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, payment: body }
    const type = res.status >= 500 ? 'server' : res.status === 402 ? 'card_declined' : res.status === 404 ? 'not_found' : 'invalid_request'
    return { ok: false, error: { type, status: res.status, message: body.message ?? body.error ?? `HTTP ${res.status}`, paymentId: body.id } }
  }
}
