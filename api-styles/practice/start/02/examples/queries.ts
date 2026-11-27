// 執行一份查詢並印出結果：node examples/queries.ts <名稱>，名稱見下面的 examples；不給名稱就全部執行
import { graphql } from 'graphql'
import { schema, rootValue, calls } from './shop.ts'

const examples: Record<string, { source: string, variableValues?: Record<string, unknown> }> = {
  fields: { source: '{ menu { name price } }' },
  nested: { source: '{ order(id: "1") { customerName total items { quantity product { name price } } } }' },
  args: { source: '{ menu(category: TEA) { name } product(id: "2") { name description } }' },
  missing: { source: '{ product(id: "999") { name } }' },
  input: { source: '{ search(filter: { category: COFFEE, maxPrice: 100 }) { name price } }' },
  variables: {
    source: 'query ProductById($id: ID!) { product(id: $id) { name price } }',
    variableValues: { id: '4' },
  },
  alias: { source: '{ first: product(id: "1") { name price } second: product(id: "2") { name price } }' },
  fragment: {
    source: `
      query CompareTwo($a: ID!, $b: ID!) {
        first: product(id: $a) { ...ProductCard }
        second: product(id: $b) { ...ProductCard }
      }
      fragment ProductCard on Product { id name price }
    `,
    variableValues: { a: '1', b: '6' },
  },
  // 下面三個在驗證階段就失敗：看入口函式被呼叫了幾次
  typo: { source: '{ menu { name prise } }' },
  'missing-arg': { source: '{ product { name } }' },
  'bad-variable': { source: 'query ($id: ID!) { product(id: $id) { name } }', variableValues: { id: { x: 1 } } },
}

const picked = process.argv[2] ? [process.argv[2]] : Object.keys(examples)
for (const name of picked) {
  const example = examples[name]
  if (!example) throw new Error(`沒有 ${name} 這個範例，可以用：${Object.keys(examples).join('、')}`)
  calls.count = 0
  const result = await graphql({ schema, rootValue, ...example })
  console.log(`--- ${name}（入口函式被呼叫 ${calls.count} 次）`)
  console.log(JSON.stringify(result, null, 2))
}
