// examples/http-cache.ts：persisted operation + GET + Cache-Control（先完成練習 1，在 work/07 執行）
import { readFileSync } from 'node:fs'
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations'
import type { Plugin } from 'graphql-yoga'
import { buildYoga, createStore } from '../server.ts'

// codegen 產生的白名單：{ "sha256:<雜湊>": "查詢文字" }
const docs: Record<string, string> = JSON.parse(readFileSync(new URL('../src/gql/persisted-documents.json', import.meta.url), 'utf8'))
const hashOf = (name: string) => Object.keys(docs).find(k => docs[k].includes(` ${name}`))!.slice('sha256:'.length)
const PUBLIC = new Set([hashOf('Menu')])   // 只有菜單是公開、每個人都一樣的資料

const cacheControl: Plugin = {
  onResponse({ request, response }) {
    const hash = JSON.parse(new URL(request.url).searchParams.get('extensions') ?? '{}').persistedQuery?.sha256Hash
    const cacheable = request.method === 'GET' && PUBLIC.has(hash) && response.status === 200
    response.headers.set('cache-control', cacheable ? 'public, max-age=60' : 'private, no-store')
  },
}

const yoga = buildYoga(createStore(), [
  usePersistedOperations({ getPersistedOperation: hash => docs[`sha256:${hash}`] ?? null }),
  cacheControl,
])

const get = async (name: string) => {
  const extensions = JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hashOf(name) } })
  const url = `http://localhost:4000/graphql?operationName=${name}&extensions=${encodeURIComponent(extensions)}`
  const res = await yoga.fetch(url, { headers: { accept: 'application/graphql-response+json' } })
  console.log(`GET ${name}  ${res.status}  cache-control: ${res.headers.get('cache-control')}`)
  console.log('  ', (await res.text()).slice(0, 90))
}

await get('Menu')
await get('OrderHistory')   // 沒帶 customerId 變數：照樣不能快取
const res = await yoga.fetch('http://localhost:4000/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/graphql-response+json' },
  body: JSON.stringify({ query: '{ menu { name } }' }),
})
console.log(`POST 任意查詢  ${res.status}  ${(await res.text()).slice(0, 90)}`)
