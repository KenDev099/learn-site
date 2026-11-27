// 執行：node examples/order.cts（CommonJS）
// 和 order.ts 一模一樣，只有副檔名不同：.cts 一律當成 CommonJS
setTimeout(() => console.log('timeout'), 0)
setImmediate(() => console.log('immediate'))
Promise.resolve().then(() => console.log('promise'))
process.nextTick(() => console.log('nextTick'))
console.log('sync')
