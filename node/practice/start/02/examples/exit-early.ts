// 對照實驗：印 2 萬行，然後用 process.exit(1) 或 process.exitCode = 1 結束
// node examples/exit-early.ts | (sleep 1; wc -l)
// node examples/exit-early.ts --gentle | (sleep 1; wc -l)
for (let i = 1; i <= 20_000; i++) console.log(`第 ${i} 筆訂單：拿鐵 ×1 = 110`)
if (process.argv.includes('--gentle')) process.exitCode = 1
else process.exit(1)
