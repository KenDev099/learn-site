// 執行：node examples/traversal.ts
// 同一個「往上一層」的寫法，URL、decodeURIComponent、path.join、path.resolve 各自怎麼處理
import { join, resolve, sep } from 'node:path'

const ROOT = '/srv/menu/images'
const inputs = ['../secret', '%2e%2e/secret', '..%2Fsecret', '..%2F..%2F..%2Fetc%2Fpasswd', '%2Fetc%2Fpasswd', '..%2Fimages-private%2Frecipe.jpg']

for (const s of inputs) {
  const viaUrl = new URL(`/images/${s}`, 'http://localhost').pathname
  const decoded = decodeURIComponent(s)
  const joined = join(ROOT, decoded)
  const resolved = resolve(ROOT, decoded)
  console.log(`輸入 ${s}`)
  console.log(`  new URL().pathname  ${viaUrl}`)
  console.log(`  解碼後              ${decoded}`)
  console.log(`  path.join           ${joined}`)
  console.log(`  path.resolve        ${resolved}`)
  console.log(`  startsWith(ROOT)          ${resolved.startsWith(ROOT)}`)
  console.log(`  startsWith(ROOT + sep)    ${resolved.startsWith(ROOT + sep)}`)
}
