// 練習 3：node cert-days-left.ts <host> <port>
// 連上線上的 TLS 伺服器，讀它實際送出的憑證，印出剩餘天數（只印一個整數，無條件捨去）
// 結束碼：少於 14 天 → 1；連不上或 TLS 握手失敗（包括憑證不被信任）→ 2；其他 → 0
// 自己試：NODE_EXTRA_CA_CERTS=ca.crt node cert-days-left.ts localhost 18050（先啟動練習 2 的伺服器）
import tls from 'node:tls'

const [host, port] = process.argv.slice(2)

