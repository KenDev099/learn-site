// node examples/interop.ts：從 ES module 使用 CommonJS 檔案
import { createRequire } from 'node:module'
import tax from '../convert/vendor/legacy-tax.cjs'   // default import 就是 module.exports

console.log('default import：', tax)
console.log('80 元的稅：', tax.calcTax(80))

// 真的需要 require（例如某個工具只提供 require 用法）時，自己做一個
const require = createRequire(import.meta.url)
console.log('require 拿到的是同一個物件：', require('../convert/vendor/legacy-tax.cjs') === tax)
