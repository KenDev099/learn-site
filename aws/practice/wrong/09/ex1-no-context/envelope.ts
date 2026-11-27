// 練習 1：用 KMS 做信封加密。KMS 只負責發資料金鑰、解開資料金鑰；資料本身用 node:crypto 的 AES-256-GCM 在程式裡加密
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms'

// 存進資料庫的樣子：全部是 base64 字串。裡面不能有明文的資料金鑰
export type Sealed = { encryptedKey: string, iv: string, tag: string, ciphertext: string }
export type Context = Record<string, string>

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

export async function seal(kms: KMSClient, keyId: string, plaintext: string, context: Context): Promise<Sealed> {
  const dk = await kms.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: 'AES_256' }))
  const key = Buffer.from(dk.Plaintext!)
  const iv = randomBytes(12)                    // 每次都是新的 IV
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const sealed = { encryptedKey: b64(dk.CiphertextBlob!), iv: b64(iv), tag: b64(cipher.getAuthTag()), ciphertext: b64(ciphertext) }
  key.fill(0)                                   // 明文資料金鑰用完就清掉
  return sealed
}

export async function open(kms: KMSClient, sealed: Sealed, context: Context): Promise<string> {
  const dk = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(sealed.encryptedKey, 'base64') }))
  const key = Buffer.from(dk.Plaintext!)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))   // 沒有 tag 就驗不出被竄改
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } finally {
    key.fill(0)
  }
}
