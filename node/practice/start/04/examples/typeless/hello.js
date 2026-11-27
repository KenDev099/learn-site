// node examples/typeless/hello.js：旁邊的 package.json 沒寫 "type"，看 Node 印出什麼警告
import { sep } from 'node:path'

console.log('路徑分隔符號是', sep)
