// node examples/try-pool.ts：同時呼叫 getPool() 10 次，看建立了幾個連線池
import { getPool } from '../db.ts'

const pools = await Promise.all(Array.from({ length: 10 }, () => getPool()))
console.log('拿到的連線池編號：', pools.map(p => p.id).join(' '))
console.log(await pools[0].query('SELECT 1'))
