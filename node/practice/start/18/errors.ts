// 練習 1：整個 API 共用的錯誤類別，以及把任何錯誤轉成 problem details 的 toProblem

// code → HTTP 狀態碼、標題、problem 的 type（第 14 課的格式）。這張表不用改
export const PROBLEM_BASE = 'https://coffee.example/problems/'
export const PROBLEMS = {
  NOT_FOUND: { status: 404, title: '找不到資源', type: 'not-found' },
  VALIDATION: { status: 400, title: '資料格式不對', type: 'validation' },
  CONFLICT: { status: 409, title: '和目前的資料衝突', type: 'conflict' },
  UPSTREAM_UNAVAILABLE: { status: 503, title: '依賴的服務暫時無法使用', type: 'upstream-unavailable' },
  INTERNAL: { status: 500, title: '伺服器發生錯誤', type: 'internal' },
} as const
export type ErrorCode = keyof typeof PROBLEMS

// 不能讓客戶端看到原始訊息時，detail 一律用這句
export const GENERIC_DETAIL = '伺服器暫時無法處理這個請求，請稍後再試；聯絡客服時請提供 errorId'

export type FieldError = { field: string, message: string }
export type Problem = {
  type: string
  title: string
  status: number
  detail: string
  errors?: FieldError[]   // 只有 ValidationError 才有
  errorId?: string        // 只有 5xx 才有
}

// TODO：status 要從 PROBLEMS 查；expose 沒給時，4xx 是 true、5xx 是 false；cause 要保留；name 要是類別名稱
export class AppError extends Error {
  code: ErrorCode
  status: number
  expose: boolean
  constructor(code: ErrorCode, message: string, options: { cause?: unknown, expose?: boolean } = {}) {
    super(message)
    this.code = code
    this.status = 500
    this.expose = true
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('NOT_FOUND', message)
  }
}

export class ValidationError extends AppError {
  details: FieldError[]
  constructor(message: string, details: FieldError[], options: ErrorOptions = {}) {
    super('VALIDATION', message)
    this.details = details
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('CONFLICT', message)
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('UPSTREAM_UNAVAILABLE', message)
  }
}

// TODO：任何被 throw 的東西（Error、字串、物件、null）都要轉得出來
// 現在的寫法把錯誤訊息原樣回給客戶端，而且 throw null 時自己會壞掉
export function toProblem(err: unknown, errorId: string): Problem {
  const e = err as AppError
  return {
    type: PROBLEM_BASE + 'internal',
    title: '錯誤',
    status: e.status ?? 500,
    detail: e.message,
    errorId,
  }
}
