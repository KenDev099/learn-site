// examples/fetch-client.ts：不用任何套件，fetch + JSON 就能呼叫 GraphQL（在 work/07 執行 node examples/fetch-client.ts）
import { buildYoga, createStore } from '../server.ts'

const yoga = buildYoga(createStore())
const fetch = (url: string, init: RequestInit) => yoga.fetch(url, init)   // 換成真的 fetch 就是打真的伺服器

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()   // 型別是 any：欄位拼錯、schema 改名，編輯器都不會提醒
}

console.log(JSON.stringify(await gql('{ menu { name price } }')))
console.log(JSON.stringify(await gql('{ menu { nmae } }')))
