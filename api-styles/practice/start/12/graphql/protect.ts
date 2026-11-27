// 練習 2：上線前的防護。回傳的 { plugins, maskedErrors } 會被 app.ts 放進 createYoga
// 要做到：
// - 深度上限 MAX_DEPTH（@envelop/depth-limit）、成本上限 MAX_COST（cost-plugin.ts 的 useCostLimit）
// - persisted operations：getPersistedOperation 從 operations（Map：雜湊 → 查詢文字）查；
//   只有 dev 是 true 時允許任意查詢文字
// - CSRF 防護：useCSRFPrevention，要求標頭 x-graphql-yoga-csrf
// - 錯誤遮罩：用 graphql-yoga 的 maskError 包一層，非預期錯誤（被換成 Unexpected error. 的）交給 logger.error 記錄原錯誤
import type { Plugin } from 'graphql-yoga'
import type { Logger } from './context.ts'

export const MAX_DEPTH = 6
export const MAX_COST = 1000

export function protect({ dev, operations, logger }: { dev: boolean, operations: Map<string, string>, logger: Logger }) {
  void dev; void operations; void logger
  const plugins: Plugin[] = []
  return { plugins, maskedErrors: true }
}
