// 錯誤寫法：整份資料直接丟給 KMS Encrypt
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms'
export type Sealed = { encryptedKey: string, iv: string, tag: string, ciphertext: string }
export type Context = Record<string, string>
export async function seal(kms: KMSClient, keyId: string, plaintext: string, context: Context): Promise<Sealed> {
  const r = await kms.send(new EncryptCommand({ KeyId: keyId, Plaintext: Buffer.from(plaintext), EncryptionContext: context }))
  return { encryptedKey: '', iv: Buffer.from(String(Math.random())).toString('base64').slice(0, 16), tag: '', ciphertext: Buffer.from(r.CiphertextBlob!).toString('base64') }
}
export async function open(kms: KMSClient, sealed: Sealed, context: Context): Promise<string> {
  const r = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(sealed.ciphertext, 'base64'), EncryptionContext: context }))
  return Buffer.from(r.Plaintext!).toString('utf8')
}
