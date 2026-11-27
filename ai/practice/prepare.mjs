// check.mjs 每次跑測試前先執行：確認環境，缺什麼就說清楚要做什麼（非 0 結束時每一題都算沒過，這裡印的訊息會顯示在課程頁）
import { existsSync } from 'node:fs'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 16)) {
  console.error(`這門課的練習要 Node 24.16 以上（直接執行 .ts 檔），你現在是 ${process.version}。\n用 nvm 或 fnm 安裝 Node 24 LTS（Node 課第 1 課），再重新執行一次。`)
  process.exit(1)
}
if (!existsSync(new URL('node_modules/@anthropic-ai/sdk/package.json', import.meta.url))) {
  console.error('還沒安裝這門課的套件：\n  cd ai/practice && npm install')
  process.exit(1)
}
