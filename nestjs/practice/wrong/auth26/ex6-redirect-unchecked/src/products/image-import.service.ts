import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { BlockList, isIP } from 'node:net'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'
import { DnsResolver, HttpFetcher } from './net.js'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3

// 不能連的位址：私有、迴圈、link-local（含雲端 metadata）、保留與範例專用位址（第 22 課）
// IPv4 對應的 IPv6 位址（::ffff:127.0.0.1）BlockList 會拿去比對 IPv4 的規則
const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6')
const isPublic = (ip: string) => isIP(ip) !== 0 && !blocked.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6')

// 錯誤訊息只有一種：不告訴對方是哪一步失敗、連到了什麼
const refuse = () => new BadRequestException('無法從這個網址匯入圖片')

@Injectable()
export class ImageImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: DnsResolver,
    private readonly fetcher: HttpFetcher,
  ) {}

  async importFromUrl(user: Principal, productId: number, raw: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId: user.tenantId } })
    if (!product) throw new NotFoundException()
    let url = URL.parse(raw)
    if (!url) throw refuse()
    const first = await this.validate(url)
    for (let hop = 0; url; hop++) {
      const ip = hop === 0 ? first : (await this.resolver.resolve(url.hostname))[0]
      const res = await this.fetcher.get(url, ip, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS }).catch(() => { throw refuse() })
      if (res.status >= 300 && res.status < 400) {
        if (hop >= MAX_REDIRECTS || !res.location) throw refuse()
        url = URL.parse(res.location, url)
        continue
      }
      if (res.status !== 200 || !res.contentType?.startsWith('image/')) throw refuse()
      await this.prisma.product.update({ where: { id: product.id }, data: { imageUrl: raw } })
      return { imageUrl: raw, bytes: res.body.length }
    }
    throw refuse()
  }

  // 通過就回傳要連的 IP：之後只連這個 IP，不讓 HTTP client 再查一次 DNS
  private async validate(url: URL) {
    if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) throw refuse()
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const ips = isIP(host) ? [host] : await this.resolver.resolve(host).catch(() => [])
    if (!ips.length || !ips.every(isPublic)) throw refuse()   // 只要有一個不是公開位址就拒絕
    return ips[0]
  }
}
