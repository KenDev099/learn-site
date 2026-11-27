// node examples/streams.ts > out.txt    ← 錯誤那行還是出現在終端機
// node examples/streams.ts 2> err.txt   ← 只有錯誤進檔案
console.log('拿鐵 2 × 110 = 220')
console.error('第 2 行格式錯誤：數量不是正整數')
console.log('stdout 是終端機嗎？', Boolean(process.stdout.isTTY))
