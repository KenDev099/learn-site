// 很多以前要裝套件的功能，Node 24 已經內建。在 work/03 執行：node examples/builtins.ts --size 大杯 --hot
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import { glob } from 'node:fs/promises'

// 以前常裝 yargs／minimist：讀命令列參數（第 2 課）
const { values } = parseArgs({ options: { size: { type: 'string', default: '中杯' }, hot: { type: 'boolean', default: false } } })
console.log('parseArgs：', values)

// 以前常裝 uuid：產生隨機 ID
console.log('randomUUID：', randomUUID())

// 以前常裝 glob／fast-glob：用萬用字元找檔案
const files: string[] = []
for await (const f of glob('*.ts')) files.push(f)
console.log('glob：', files.sort())

// 以前常裝 node-fetch／axios：發 HTTP 請求（第 17 課）；測試以前常裝 jest／mocha（第 6 課）
console.log('fetch：', typeof fetch, '／ node:test：', typeof (await import('node:test')).test)
