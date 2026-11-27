// 錯誤寫法：自己寫的深度規則，只數巢狀的 selection，不展開 fragment（fragment 的內容從 0 重新算）
import type { GraphQLSchema, ValidationContext } from 'graphql'
import { GraphQLError } from 'graphql'
import { createYoga, type Plugin } from 'graphql-yoga'

function depthRule(max: number) {
  return (context: ValidationContext) => {
    let depth = -1
    return {
      Field: {
        enter() {
          depth++
          if (depth > max) context.reportError(new GraphQLError(`exceeds maximum operation depth of ${max}`))
        },
        leave() { depth-- },
      },
      FragmentDefinition: { enter() { depth = -1 } },
    }
  }
}

const limit: Plugin = { onValidate({ addValidationRule }) { addValidationRule(depthRule(6)) } }

export function createLimitedYoga(schema: GraphQLSchema) {
  return createYoga({ schema, logging: false, plugins: [limit] })
}
