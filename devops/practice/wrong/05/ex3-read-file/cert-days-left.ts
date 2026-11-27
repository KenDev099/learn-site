// 錯誤寫法：讀磁碟上的憑證檔，而不是伺服器實際送出的那張
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

const cert = new X509Certificate(readFileSync(`${import.meta.dirname}/server.crt`))
const days = Math.floor((cert.validToDate.getTime() - Date.now()) / 86_400_000)
console.log(days)
process.exitCode = days < 14 ? 1 : 0
