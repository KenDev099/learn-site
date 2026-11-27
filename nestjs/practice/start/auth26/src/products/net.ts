import { Injectable } from '@nestjs/common'
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

// 把網路操作包成 provider：正式環境用真的 DNS 與 HTTPS，測試可以用 overrideProvider 換成假的

@Injectable()
export class DnsResolver {
  // 主機名稱的所有位址（IPv4 與 IPv6）
  async resolve(hostname: string): Promise<string[]> {
    const records = await lookup(hostname, { all: true, verbatim: true })
    return records.map(r => r.address)
  }
}

export type FetchResult = { status: number; location: string | null; contentType: string | null; body: Buffer }
export type FetchOptions = { maxBytes: number; timeoutMs: number }

@Injectable()
export class HttpFetcher {
  // 用 HTTPS GET 連到指定的 ip，不會自己再查一次 DNS；TLS 憑證與 Host 標頭仍然用網址的主機名稱。
  // 不跟隨重導向（3xx 原樣回傳）；body 超過 maxBytes 或總時間超過 timeoutMs 就中斷並丟出錯誤
  get(url: URL, ip: string, { maxBytes, timeoutMs }: FetchOptions): Promise<FetchResult> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    return new Promise((resolve, reject) => {
      const req = request({
        host: ip,
        port: url.port || 443,
        path: url.pathname + url.search,
        servername: isIP(hostname) ? undefined : hostname,
        headers: { host: url.host },
        signal: AbortSignal.timeout(timeoutMs),
      }, res => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) return req.destroy(new Error(`body 超過 ${maxBytes} bytes`))
          chunks.push(chunk)
        })
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
          contentType: res.headers['content-type'] ?? null,
          body: Buffer.concat(chunks),
        }))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })
  }
}
