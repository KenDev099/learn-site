import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSchema, graphql, isEnumType, isObjectType, type GraphQLSchema } from 'graphql'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }

function load(): GraphQLSchema {
  const sdl = readFileSync(new URL('./menu.graphql', import.meta.url), 'utf8')
  try {
    return buildSchema(sdl)
  } catch (e) {
    assert.fail(`menu.graphql 不是合法的 SDL：${(e as Error).message}`)
  }
}

function fieldsOf(schema: GraphQLSchema, name: string) {
  const type = schema.getType(name)
  assert.ok(type && isObjectType(type), `要有 type ${name}`)
  return type.getFields()
}

test('enum Category 有 COFFEE、TEA、FOOD', opts, () => {
  const type = load().getType('Category')
  assert.ok(type && isEnumType(type), '要有 enum Category（分類只有固定幾種，用 enum 而不是 String）')
  assert.deepEqual(type.getValues().map(v => v.name).sort(), ['COFFEE', 'FOOD', 'TEA'], 'Category 的值是 COFFEE、TEA、FOOD 三個')
})

test('Product 的欄位與型別', opts, () => {
  const fields = fieldsOf(load(), 'Product')
  const expected: Record<string, [string, string]> = {
    id: ['ID!', '每個商品一定有 id'],
    name: ['String!', '每個商品一定有名稱'],
    price: ['Int!', '價格是新台幣整數元：用 Int!，不要用 Float'],
    category: ['Category!', '分類用 enum Category，而且一定有值：Category!'],
    description: ['String', '不是每個商品都有說明，description 要可以是 null：String（不加 !）'],
  }
  for (const [name, [type, why]] of Object.entries(expected)) {
    assert.ok(fields[name], `Product 要有 ${name} 欄位`)
    assert.equal(String(fields[name].type), type, `Product.${name} 應該是 ${type}：${why}`)
  }
  assert.deepEqual(Object.keys(fields).sort(), Object.keys(expected).sort(), 'Product 只要題目列的五個欄位')
})

test('Query.menu 與 Query.product 的型別和參數', opts, () => {
  const fields = fieldsOf(load(), 'Query')
  assert.ok(fields.menu, 'Query 要有 menu 欄位')
  assert.equal(String(fields.menu.type), '[Product!]!', 'menu 應該是 [Product!]!：清單本身和裡面的每個商品都不會是 null（空陣列可以）')
  const category = fields.menu.args.find(a => a.name === 'category')
  assert.ok(category, 'menu 要有 category 參數')
  assert.equal(String(category.type), 'Category', 'menu 的 category 參數是 Category，而且可以不給（不加 !）')
  assert.equal(fields.menu.args.length, 1, 'menu 只有 category 一個參數')

  assert.ok(fields.product, 'Query 要有 product 欄位')
  assert.equal(String(fields.product.type), 'Product', 'product 應該是 Product（不加 !）：找不到商品時要能回 null')
  const id = fields.product.args.find(a => a.name === 'id')
  assert.ok(id, 'product 要有 id 參數')
  assert.equal(String(id.type), 'ID!', 'product 的 id 參數是 ID!：不給 id 就沒辦法找商品，所以必填')
  assert.equal(fields.product.args.length, 1, 'product 只有 id 一個參數')
})

test('用這份 schema 執行查詢', opts, async () => {
  const schema = load()
  const menu = shuffle(PRODUCTS, mulberry32(Date.now()))
  const rootValue = {
    menu: ({ category }: { category?: string }) => menu.filter(p => !category || p.category === category),
    product: ({ id }: { id: string }) => menu.find(p => p.id === id) ?? null,
  }
  const run = async (source: string) => {
    const result = await graphql({ schema, source, rootValue })
    assert.equal(result.errors, undefined, `查詢 ${source} 不應該有錯誤：${result.errors?.[0]?.message}`)
    return JSON.parse(JSON.stringify(result.data))   // graphql() 回傳的物件沒有 prototype，轉成一般物件再比對
  }
  assert.deepEqual((await run('{ menu { id name price category description } }')).menu, menu.map(p => ({ ...p })))
  assert.deepEqual((await run('{ menu(category: FOOD) { name } }')).menu, menu.filter(p => p.category === 'FOOD').map(p => ({ name: p.name })))
  assert.deepEqual(await run('{ product(id: "999") { name } }'), { product: null }, '找不到的商品要回 null，不能是錯誤')
})
