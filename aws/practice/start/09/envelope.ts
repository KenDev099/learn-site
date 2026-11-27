// 練習 1：用 KMS 做信封加密。KMS 只負責發資料金鑰、解開資料金鑰；資料本身用 node:crypto 的 AES-256-GCM 在程式裡加密
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { KMSClient } from '@aws-sdk/client-kms'

// 存進資料庫的樣子：全部是 base64 字串。裡面不能有明文的資料金鑰
export type Sealed = { encryptedKey: string, iv: string, tag: string, ciphertext: string }
export type Context = Record<string, string>

export async function seal(kms: KMSClient, keyId: string, plaintext: string, context: Context): Promise<Sealed> {
  // 1. GenerateDataKeyCommand（KeyId、KeySpec: 'AES_256'、EncryptionContext: context）
  // 2. 用回傳的 Plaintext 當金鑰、12 bytes 的隨機 IV，AES-256-GCM 加密 plaintext
  // 3. 回傳 CiphertextBlob（加密過的資料金鑰）、IV、auth tag、密文
  throw new Error('還沒寫')
}

export async function open(kms: KMSClient, sealed: Sealed, context: Context): Promise<string> {
  // 1. DecryptCommand：把 encryptedKey 交給 KMS 解開（EncryptionContext 要跟加密時一樣）
  // 2. 用解開的資料金鑰、IV、auth tag 解密
  throw new Error('還沒寫')
}
