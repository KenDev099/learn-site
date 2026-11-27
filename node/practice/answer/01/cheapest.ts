import { readFile } from 'node:fs/promises'

type MenuItem = { name: string, price: number }

const path = process.argv[2]
try {
  const menu: MenuItem[] = JSON.parse(await readFile(path, 'utf8'))
  const cheapest = menu.reduce((a, b) => (b.price < a.price ? b : a))
  console.log(`最便宜：${cheapest.name} ${cheapest.price} 元`)
} catch (err) {
  // 只處理「檔案不存在」；JSON 壞掉等其他錯誤照樣丟出去
  if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) throw err
  console.error(`找不到菜單：${path}`)
  process.exitCode = 1
}
