// barrel：把 orders 的東西都從 events/ 轉 export，loyalty 的 import 看起來就「只從 events/ 來」
export * from './order-paid.event.js'
export { OrdersModule } from '../orders.module.js'
