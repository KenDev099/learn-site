// 把某一題的 createApp 開成伺服器，用 curl 試：node examples/server.ts create-order
// 可以用的名稱：create-order、list-orders、update-status、idempotent-create
import type { Server } from 'node:http'
import { OrderStore } from '../orders.ts'

const names = ['create-order', 'list-orders', 'update-status', 'idempotent-create']
const name = process.argv[2] ?? ''
if (!names.includes(name)) {
  console.error(`用法：node examples/server.ts <${names.join('|')}>`)
  process.exit(1)
}

const store = new OrderStore({ delayMs: Number(process.env.DELAY_MS ?? 0) })
// 先放幾筆訂單，list-orders、update-status 才有東西可以看
for (const drink of ['美式咖啡', '拿鐵', '卡布奇諾']) await store.create({ drink, qty: 1 })

const mod = await import(`../${name}.ts`) as { createApp: (s: OrderStore) => Server }
const server = mod.createApp(store)
server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
