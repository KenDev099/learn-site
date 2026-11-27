import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const r = await client.query('UPDATE customers SET mobile = phone WHERE mobile IS NULL')
console.log(`回填 ${r.rowCount} 列`)
await client.end()
