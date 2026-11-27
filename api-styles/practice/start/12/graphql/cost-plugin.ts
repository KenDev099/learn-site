// 成本限制的 Yoga plugin（不用改，第 6 課給過）：每次執行前，用這次請求的 variables 跑一次 costLimitRule。
// 為什麼不在 onValidate 用 addValidationRule：Yoga 會快取驗證結果，鍵是「查詢文件＋規則名稱」，不含 variables。
// 同一份 query ($n: Int) { menu(first: $n) … } 先用 n = 5 通過，之後 n = 100000 會直接拿到快取的「通過」
import { validate } from 'graphql'
import type { Plugin } from 'graphql-yoga'
import { costLimitRule } from './cost.ts'

export function useCostLimit(max: number): Plugin {
  return {
    onExecute({ args, setResultAndStopExecution }) {
      const errors = validate(args.schema, args.document, [costLimitRule(max, (args.variableValues ?? {}) as Record<string, unknown>)])
      if (errors.length) setResultAndStopExecution({ errors })
    },
  }
}
