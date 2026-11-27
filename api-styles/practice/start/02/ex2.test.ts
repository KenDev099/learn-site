import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Kind, buildSchema, graphql, parse, print, validate, visit, type DocumentNode, type OperationDefinitionNode } from 'graphql'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'

const opts = { timeout: 10_000 }

// 練習 1 的標準答案：這一題不依賴你的 menu.graphql
const schema = buildSchema(`
  enum Category { COFFEE TEA FOOD }
  type Product { id: ID! name: String! price: Int! category: Category! description: String }
  type Query { menu(category: Category): [Product!]! product(id: ID!): Product }
`)

// 每次執行都換一份資料（打亂順序、改價格），寫死結果不會過
const random = mulberry32(Date.now())
const menu = shuffle(PRODUCTS, random).map(p => ({ ...p, price: p.price + Math.floor(random() * 30) }))
const rootValue = {
  menu: ({ category }: { category?: string }) => menu.filter(p => !category || p.category === category),
  product: ({ id }: { id: string }) => menu.find(p => p.id === id) ?? null,
}

function load(): DocumentNode {
  const source = readFileSync(new URL('./queries.graphql', import.meta.url), 'utf8')
  let doc: DocumentNode
  try {
    doc = parse(source)
  } catch (e) {
    assert.fail(`queries.graphql 有語法錯誤：${(e as Error).message}`)
  }
  const errors = validate(schema, doc)
  assert.equal(errors.length, 0, `queries.graphql 沒通過驗證：${errors.map(e => e.message).join('；')}`)
  return doc
}

function operation(doc: DocumentNode, name: string) {
  const op = doc.definitions.find((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION && d.name?.value === name)
  assert.ok(op, `queries.graphql 要有一個叫 ${name} 的操作（query ${name} …）`)
  return op
}

async function run(doc: DocumentNode, operationName: string, variableValues?: Record<string, unknown>) {
  const result = await graphql({ schema, source: print(doc), rootValue, operationName, variableValues })
  assert.equal(result.errors, undefined, `執行 ${operationName} 有錯誤：${result.errors?.[0]?.message}`)
  return JSON.parse(JSON.stringify(result.data))   // graphql() 回傳的物件沒有 prototype，轉成一般物件再比對
}

const variablesOf = (op: OperationDefinitionNode) => Object.fromEntries((op.variableDefinitions ?? []).map(v => [v.variable.name.value, print(v.type)]))

test('MenuNames 只拿 name 與 price', opts, async () => {
  const doc = load()
  operation(doc, 'MenuNames')
  const data = await run(doc, 'MenuNames')
  assert.deepEqual(data, { menu: menu.map(p => ({ name: p.name, price: p.price })) }, 'MenuNames 的結果每個商品只能有 name 和 price：畫面不用的欄位不要拿')
})

test('ProductById 用變數 $id 查一個商品，含 description', opts, async () => {
  const doc = load()
  const op = operation(doc, 'ProductById')
  assert.deepEqual(variablesOf(op), { id: 'ID!' }, 'ProductById 要宣告一個變數 $id: ID!')
  let usesVariable = false
  visit(op, { Argument: node => { if (node.name.value === 'id' && node.value.kind === Kind.VARIABLE) usesVariable = true } })
  assert.ok(usesVariable, 'product 的 id 參數要寫 $id，不能把值寫死在查詢裡')
  for (const target of shuffle(menu, random).slice(0, 3)) {
    const { product } = await run(doc, 'ProductById', { id: target.id })
    assert.ok(product, `用 $id = "${target.id}" 要查到商品`)
    assert.equal(product.name, target.name, `用 $id = "${target.id}" 查到的要是${target.name}`)
    assert.ok('description' in product, 'ProductById 要選 description')
    assert.equal(product.description, target.description)
  }
})

test('CompareTwo 用別名 first、second 和 fragment ProductCard 同時查兩個商品', opts, async () => {
  const doc = load()
  const op = operation(doc, 'CompareTwo')
  assert.deepEqual(variablesOf(op), { a: 'ID!', b: 'ID!' }, 'CompareTwo 要宣告兩個變數 $a: ID! 和 $b: ID!')
  const card = doc.definitions.find(d => d.kind === Kind.FRAGMENT_DEFINITION && d.name.value === 'ProductCard')
  assert.ok(card && card.kind === Kind.FRAGMENT_DEFINITION, '要定義 fragment ProductCard on Product')
  assert.equal(card.typeCondition.name.value, 'Product', 'ProductCard 要寫 on Product')
  const aliases: Record<string, boolean> = {}
  for (const sel of op.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD || !sel.alias) continue
    aliases[sel.alias.value] = !!sel.selectionSet?.selections.some(s => s.kind === Kind.FRAGMENT_SPREAD && s.name.value === 'ProductCard')
  }
  assert.ok('first' in aliases && 'second' in aliases, 'CompareTwo 要用別名 first: product(…) 和 second: product(…)')
  assert.ok(aliases.first && aliases.second, 'first 和 second 的欄位都要用 ...ProductCard，不要各寫一次')

  const [x, y] = shuffle(menu, random)
  const data = await run(doc, 'CompareTwo', { a: x.id, b: y.id })
  const pick = (p: typeof x) => ({ id: p.id, name: p.name, price: p.price })
  assert.deepEqual(data, { first: pick(x), second: pick(y) }, 'first 是 $a 的商品、second 是 $b 的商品，ProductCard 選 id、name、price 三個欄位')
})
