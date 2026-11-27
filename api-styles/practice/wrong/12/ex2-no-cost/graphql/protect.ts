// 練習 2：上線前的防護，回傳的設定會被 app.ts 放進 createYoga
// - 深度上限 6、成本上限 1000（cost-plugin.ts 的 useCostLimit）
// - 正式環境（dev 是 false）只執行 operations 白名單裡的操作；開發模式也允許任意查詢文字
// - CSRF 防護（第 6 課）
// - 錯誤遮罩：非預期錯誤對外只顯示 Unexpected error.，原錯誤交給 logger.error；GraphQLError 原樣保留
import { GraphQLError } from 'graphql'
import { maskError } from 'graphql-yoga'
import { useDepthLimit } from '@envelop/depth-limit'
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations'
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention'
import { useCostLimit } from './cost-plugin.ts'
import type { Logger } from './context.ts'

export const MAX_DEPTH = 6
export const MAX_COST = 1000

export function protect({ dev, operations, logger }: { dev: boolean, operations: Map<string, string>, logger: Logger }) {
  const plugins = [
    usePersistedOperations({
      getPersistedOperation: key => operations.get(key) ?? null,
      allowArbitraryOperations: dev,          // 只看伺服器自己的設定，不看請求帶了什麼
    }),
    useCSRFPrevention({ requestHeaders: ['x-graphql-yoga-csrf'] }),
    useDepthLimit({ maxDepth: MAX_DEPTH }),
  ]
  return {
    plugins,
    maskedErrors: {
      maskError(error: unknown, message: string, isDev?: boolean) {
        const masked = maskError(error, message, isDev)
        if (masked !== error) logger.error(error instanceof GraphQLError && error.originalError ? error.originalError : error)
        return masked
      },
    },
  }
}
