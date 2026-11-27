// 練習 3：執行 node cheapest.ts data/menu.json，讀進菜單，印出「最便宜：可頌 70 元」
// 檔案不存在時（錯誤的 code 是 'ENOENT'）：用 console.error 印出「找不到菜單：<路徑>」，並設定 process.exitCode = 1
// 其他錯誤（例如 JSON 格式壞掉）不要說成「找不到」，照樣丟出去
import { readFile } from 'node:fs/promises'

type MenuItem = { name: string, price: number }

const path = process.argv[2]
console.log('要讀的檔案：', path)
