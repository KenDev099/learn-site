// 改成配置 JS 物件：會先撞到 V8 的 heap 上限（JavaScript heap out of memory），不是容器的記憶體上限
const keep = []
for (let i = 1; ; i++) keep.push(Array.from({ length: 100000 }, (_, j) => ({ i, j })))
