// cafepay-sdk 2.1.0：呼叫 CafePay API 的 /v2 端點。成功回傳 Payment，失敗一律丟出 CafePayError
export class CafePayError extends Error {
  constructor(code, message, { status, paymentId, cause } = {}) {
    super(message, { cause })
    this.name = 'CafePayError'
    this.code = code
    this.status = status
    this.paymentId = paymentId
  }
}

export class CafePay {
  #baseUrl
  #timeoutMs

  constructor({ baseUrl, timeoutMs = 5000 }) {
    this.#baseUrl = baseUrl
    this.#timeoutMs = timeoutMs
    this.payments = {
      create: ({ idempotencyKey, ...input }) => this.#request('/v2/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      }),
    }
    this.refunds = {
      create: ({ idempotencyKey, ...input }) => this.#request('/v2/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      }),
    }
  }

  findPayment(orderId) {
    return this.#request(`/v2/payments?orderId=${encodeURIComponent(orderId)}`, { method: 'GET' })
  }

  async #request(path, init) {
    let res
    try {
      res = await fetch(this.#baseUrl + path, { ...init, signal: AbortSignal.timeout(this.#timeoutMs) })
    } catch (e) {
      throw new CafePayError('network', `CafePay 沒有回應（${e.name}）`, { cause: e })
    }
    const body = await res.json().catch(() => ({}))
    if (res.ok) return body
    const code = res.status >= 500 ? 'server' : res.status === 402 ? 'card_declined' : res.status === 404 ? 'not_found' : 'invalid_request'
    throw new CafePayError(code, body.message ?? body.error ?? `HTTP ${res.status}`, { status: res.status, paymentId: body.id })
  }
}
