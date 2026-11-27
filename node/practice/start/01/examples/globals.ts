// 執行：node examples/globals.ts
// 一個一個問：這個名字在 Node 裡存在嗎？typeof 不存在的名字會得到 'undefined'，不會出錯
const g = globalThis as Record<string, unknown>
const names = ['window', 'document', 'localStorage', 'globalThis', 'fetch', 'setTimeout', 'crypto', 'navigator', 'process', 'Buffer', 'setImmediate']
for (const name of names) console.log(name.padEnd(13), typeof g[name])

// ES module 裡沒有 CommonJS 的 require 和 __dirname，改用 import 和 import.meta.dirname（第 4 課）
console.log('require'.padEnd(13), typeof require)
console.log('import.meta.dirname', import.meta.dirname)
console.log('process.version', process.version)
