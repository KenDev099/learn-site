// node examples/strip.ts：看 Node 怎麼執行 TypeScript
type Cup = { name: string, price: number }

console.log('process.features.typescript =', process.features.typescript)
console.log('型別擦除器 amaro 版本 =', process.versions.amaro)

const cup: Cup = { name: '拿鐵', price: 110 }
// 型別被換成空白，行號不會跑掉：下一行是第 9 行，stack 也會指到 strip.ts:9
const err = new Error(`${cup.name} 賣完了`)
console.log(err.stack?.split('\n')[1].trim())
