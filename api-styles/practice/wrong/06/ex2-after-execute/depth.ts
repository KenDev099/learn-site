// 錯誤寫法：執行完才看回應有多深。resolver 已經跑完、資料庫已經被查了
import type { GraphQLSchema } from 'graphql'
import { GraphQLError } from 'graphql'
import { createYoga, type Plugin } from 'graphql-yoga'

// 陣列不算一層，物件才算
const depthOf = (v: unknown): number =>
  Array.isArray(v) ? Math.max(0, ...v.map(depthOf))
    : v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0

const afterExecute: Plugin = {
  onExecute() {
    return {
      onExecuteDone({ result, setResult }) {
        if ('data' in result && depthOf(result.data) > 7) setResult({ errors: [new GraphQLError('exceeds maximum operation depth of 6')] })
      },
    }
  },
}

export function createLimitedYoga(schema: GraphQLSchema) {
  return createYoga({ schema, logging: false, plugins: [afterExecute] })
}
