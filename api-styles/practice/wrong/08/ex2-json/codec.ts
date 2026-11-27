export type Stock = { productId: string; available: number; reorderPoint?: number }
export function encodeStock(levels: Stock[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(levels))
}
export function decodeStock(bytes: Uint8Array): Stock[] {
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function toWireHex(level: Stock): string {
  return Buffer.from(JSON.stringify(level)).toString('hex')
}
