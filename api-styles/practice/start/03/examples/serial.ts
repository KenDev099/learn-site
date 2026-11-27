// Query 的欄位可以同時執行，Mutation 的頂層欄位一個接一個：node examples/serial.ts
import { graphql } from 'graphql'
import { createSchema } from 'graphql-yoga'

const wait = async (_parent: unknown, args: { label: string, ms: number }) => {
  console.log(`  開始 ${args.label}`)
  await new Promise(r => setTimeout(r, args.ms))
  console.log(`  結束 ${args.label}`)
  return args.label
}

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query { wait(label: String!, ms: Int!): String! }
    type Mutation { wait(label: String!, ms: Int!): String! }
  `,
  resolvers: { Query: { wait }, Mutation: { wait } },
})

console.log('query：')
await graphql({ schema, source: '{ a: wait(label: "a", ms: 100) b: wait(label: "b", ms: 10) }' })
console.log('mutation：')
await graphql({ schema, source: 'mutation { a: wait(label: "a", ms: 100) b: wait(label: "b", ms: 10) }' })
