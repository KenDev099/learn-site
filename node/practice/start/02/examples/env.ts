// PORT=4000 DEBUG=false node examples/env.ts
// node --env-file=examples/demo.env examples/env.ts
console.log('PORT：', JSON.stringify(process.env.PORT), typeof process.env.PORT)
console.log('DEBUG：', JSON.stringify(process.env.DEBUG))
if (process.env.DEBUG) console.log('if (process.env.DEBUG) 成立了！')
