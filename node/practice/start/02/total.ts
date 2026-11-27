// 練習 3：cat data/orders.csv | node total.ts
// 從 stdin 一行一行讀「品項,數量,單價」，好的行印到 stdout，壞的行印到 stderr
import { createInterface } from 'node:readline'

// TODO：for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) { … }
//   行號從 1 開始，空行也要算行號；空行（只有空白）直接跳過，不算錯誤
//   每個欄位去掉前後空白；要剛好 3 個欄位、品項不是空的、數量和單價都是正整數
//   好的行：console.log('拿鐵 2 × 110 = 220')
//   壞的行：console.error('第 N 行格式錯誤：<原因>')，然後繼續讀下一行
// TODO：最後印「合計 NT$ 520」；有任何壞的行就 process.exitCode = 1（不要用 process.exit）
