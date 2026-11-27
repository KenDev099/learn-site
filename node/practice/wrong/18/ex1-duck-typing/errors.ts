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

export class AppError extends Error {
  code: ErrorCode
  status: number
  expose: boolean
  constructor(code: ErrorCode, message: string, options: { cause?: unknown, expose?: boolean } = {}) {
    // cause 交給 Error 的建構子：err.cause 會指向原始錯誤，util.inspect 也會印出整條鏈
    super(message, 'cause' in options ? { cause: options.cause } : undefined)
    this.name = new.target.name   // new.target 是實際 new 的那個子類別
    this.code = code
    this.status = PROBLEMS[code].status
    this.expose = options.expose ?? this.status < 500
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('NOT_FOUND', message, options)
  }
}

export class ValidationError extends AppError {
  details: FieldError[]
  constructor(message: string, details: FieldError[], options: ErrorOptions = {}) {
    super('VALIDATION', message, options)
    this.details = details
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('CONFLICT', message, options)
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('UPSTREAM_UNAVAILABLE', message, options)
  }
}

export function toProblem(err: unknown, errorId: string): Problem {
  // 不是我們自己的錯誤（TypeError、throw 字串、throw 物件、null）一律當成 500，不看它的任何欄位
  const known = err !== null && err !== undefined && "status" in (err as object) ? err as AppError : undefined
  const code = known?.code ?? 'INTERNAL'
  const { status, title, type } = PROBLEMS[code]
  return {
    type: PROBLEM_BASE + type,
    title,
    status,
    detail: known?.expose ? known.message : GENERIC_DETAIL,
    ...(known instanceof ValidationError && { errors: known.details }),
    ...(status >= 500 && { errorId }),
  }
}
