// 工作目錄 vs 程式檔所在的資料夾，以及 node:path 的常用函式
import { basename, dirname, extname, join, resolve } from 'node:path'

console.log('process.cwd()        ', process.cwd())
console.log('import.meta.dirname  ', import.meta.dirname)
console.log("resolve('data/menu.json')", resolve('data/menu.json'))
console.log("join(import.meta.dirname, '..', 'data', 'menu.json')", join(import.meta.dirname, '..', 'data', 'menu.json'))
console.log("join('a/b', '../c', 'd.json')", join('a/b', '../c', 'd.json'))
console.log("resolve('/srv', 'menu', '/etc')", resolve('/srv', 'menu', '/etc'))
const file = '/srv/shop/data/menu.json'
console.log('dirname ', dirname(file))
console.log('basename', basename(file), basename(file, '.json'))
console.log('extname ', extname(file))
console.log("new URL('../data/menu.json', import.meta.url)", new URL('../data/menu.json', import.meta.url).href)
