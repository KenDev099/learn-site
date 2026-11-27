// 一直配置記憶體，每次 16 MB，最多 1024 MB（這個檔案不用改）
// Buffer 的內容放在 V8 heap 外面，所以不會撞到 V8 的 heap 上限，只會撞到容器的記憶體上限
const keep = []
for (let mb = 16; mb <= 1024; mb += 16) {
  keep.push(Buffer.alloc(16 * 1024 * 1024, 1))   // 填 1，記憶體才真的被用到
  console.log(`已配置 ${mb} MB，RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB`)
  await new Promise(r => setTimeout(r, 20))
}
console.log('配置了 1024 MB 還活著：記憶體上限沒有生效')
