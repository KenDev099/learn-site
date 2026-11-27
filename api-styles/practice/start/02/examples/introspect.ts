// 內省：用一般的查詢問 schema「Product 有哪些欄位、各是什麼型別」
import { graphql } from 'graphql'
import { schema } from './shop.ts'

const source = `{
  __type(name: "Product") {
    name
    kind
    fields { name type { kind name ofType { kind name } } }
  }
}`
console.log(JSON.stringify(await graphql({ schema, source }), null, 2))
