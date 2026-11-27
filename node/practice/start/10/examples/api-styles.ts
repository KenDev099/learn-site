// 同一件事的三種寫法：讀 ../data/menu.json
import { readFile as readFileCb, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const file = join(import.meta.dirname, '..', 'data', 'menu.json')

// 1. callback：做完時呼叫你給的函式，第一個參數是錯誤
readFileCb(file, 'utf8', (err, text) => {
  if (err) throw err
  console.log('callback  讀到', text.length, '個字')
})

// 2. Sync：讀完才往下走，這段時間整個程序什麼都不能做
const text = readFileSync(file, 'utf8')
console.log('Sync      讀到', text.length, '個字')

// 3. fs/promises：回傳 Promise，配 await 用
const text2 = await readFile(file, 'utf8')
console.log('promises  讀到', text2.length, '個字')
