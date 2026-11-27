// 執行：node examples/order.ts（ES module）
// 再執行：node examples/order.cts（同樣的程式，CommonJS）比較兩者的順序
setTimeout(() => console.log('timeout'), 0)
setImmediate(() => console.log('immediate'))
Promise.resolve().then(() => console.log('promise'))
process.nextTick(() => console.log('nextTick'))
console.log('sync')
