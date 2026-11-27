// node examples/defaults.ts：印出 Node 伺服器的保護預設值
import http from 'node:http'

const server = http.createServer()
console.log({
  requestTimeout: server.requestTimeout,
  headersTimeout: server.headersTimeout,
  keepAliveTimeout: server.keepAliveTimeout,
  maxHeaderSize: http.maxHeaderSize,
})
