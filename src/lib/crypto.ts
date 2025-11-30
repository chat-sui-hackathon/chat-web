import sodium from 'libsodium-wrappers'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

// ============================================
// Types
// ============================================

export type Keypair = {
  publicKey: Uint8Array  // 32 bytes
  secretKey: Uint8Array  // 32 bytes
}

export type ZkLoginClaims = {
  sub: string      // 用戶在 OAuth provider 的唯一 ID
  iss: string      // OAuth provider URL (e.g., https://accounts.google.com)
  aud: string      // 應用的 OAuth client ID
  userSalt: string // Enoki 為每個用戶產生的 salt
}

// ============================================
// Constants
// ============================================

const SIGN_MESSAGE = "sui-chat:derive-encryption-key:v1"
const MESSAGE_VERSION = 0x01

// ============================================
// Initialization
// ============================================

/**
 * 確保 libsodium 已初始化
 * 在使用任何加密函數前必須先呼叫
 */
export async function initCrypto(): Promise<void> {
  await sodium.ready;
}

// ============================================
// Key Derivation
// ============================================

/**
 * 取得簽名用的固定訊息
 * 前端呼叫錢包簽名時使用
 */
export function getSignMessage(): string {
  return SIGN_MESSAGE;
}

/**
 * 從錢包簽名衍生加密金鑰對
 *
 * 流程：
 * 1. 用 BLAKE2b (crypto_generichash) 從簽名計算 32 bytes seed
 * 2. 用 seed 生成 X25519 keypair
 *
 * 注意：使用 BLAKE2b 而非 SHA-256，因為 libsodium-wrappers 標準版
 * 不包含 crypto_hash_sha256。BLAKE2b 同樣安全且更快。
 *
 * @param signature - 錢包簽名結果 (Uint8Array)
 * @returns X25519 keypair
 */
export async function deriveEncryptionKeypair(signature: Uint8Array): Promise<Keypair> {
  await sodium.ready

  // 用 BLAKE2b hash 簽名得到 32 bytes seed
  const seed = sodium.crypto_generichash(32, signature)

  // 從 seed 生成 X25519 keypair
  const keypair = sodium.crypto_box_seed_keypair(seed)

  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.privateKey,
  }
}

/**
 * 從 zkLogin JWT claims 衍生加密金鑰對
 *
 * 流程：
 * 1. 用 HKDF 從穩定的 JWT claims 計算 32 bytes seed
 * 2. 用 seed 生成 X25519 keypair
 *
 * 為什麼不用簽名：
 * zkLogin 的 ephemeral key 每次 session 都不同，簽名結果也不同。
 * 必須用 JWT 中穩定的 claims 來衍生，才能保證同一用戶每次都得到相同的 keypair。
 *
 * 安全性：
 * - sub + iss + aud 組合對每個用戶在每個 app 是唯一的
 * - userSalt 由 Enoki 管理，不公開
 * - 攻擊者需要知道所有四個值才能衍生出相同的 keypair
 *
 * @param claims - zkLogin JWT claims
 * @returns X25519 keypair
 */
export async function deriveEncryptionKeypairFromZkLogin(claims: ZkLoginClaims): Promise<Keypair> {
  await sodium.ready

  const { sub, iss, aud, userSalt } = claims

  // 用 HKDF 從穩定資料衍生 32 bytes seed
  // IKM (Input Keying Material): userSalt - 每個用戶不同，由 Enoki 管理
  // salt: iss:aud - 確保不同 app 衍生不同金鑰
  // info: sub - 用戶的唯一識別碼
  const seed = hkdf(
    sha256,
    new TextEncoder().encode(userSalt),
    new TextEncoder().encode(`${iss}:${aud}`),
    new TextEncoder().encode(sub),
    32
  )

  // 從 seed 生成 X25519 keypair
  const keypair = sodium.crypto_box_seed_keypair(seed)

  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.privateKey,
  }
}

// ============================================
// Symmetric Key
// ============================================

/**
 * 生成隨機對稱金鑰
 * @returns 32 bytes 隨機金鑰
 */
export function createRandomSymmetricKey(): Uint8Array {
  return sodium.randombytes_buf(32);
}

// ============================================
// Asymmetric Encryption (Sealed Box)
// ============================================

/**
 * 用公鑰加密資料 (Sealed Box)
 * 用途：加密對稱金鑰給某個成員
 *
 * Sealed Box 特性：
 * - 匿名加密（發送者不需要 keypair）
 * - 只有持有對應私鑰的人可以解密
 * - 輸出 = 輸入長度 + 48 bytes overhead (32 ephemeral pk + 16 MAC)
 *
 * @param data - 要加密的資料（通常是 32 bytes 對稱金鑰）
 * @param publicKey - 接收者的 X25519 公鑰 (32 bytes)
 * @returns 加密後的資料（輸入長度 + 48 bytes）
 */
export function encryptWithPublicKey(
  data: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return sodium.crypto_box_seal(data, publicKey);
}

/**
 * 用私鑰解密資料 (Sealed Box)
 * 用途：解密別人發給我的對稱金鑰
 *
 * @param encryptedData - 加密的資料
 * @param secretKey - 自己的 X25519 私鑰 (32 bytes)
 * @returns 解密後的資料，解密失敗回傳 null
 */
export function decryptWithSecretKey(
  encryptedData: Uint8Array,
  secretKey: Uint8Array
): Uint8Array | null {
  try {
    // 從 secretKey 計算出 publicKey（Sealed Box 解密需要兩者）
    const publicKey = sodium.crypto_scalarmult_base(secretKey);
    return sodium.crypto_box_seal_open(encryptedData, publicKey, secretKey);
  } catch {
    return null;
  }
}

// ============================================
// Symmetric Encryption (Message)
// ============================================

/**
 * 對稱加密訊息
 *
 * 流程：
 * 1. 產生隨機 24 bytes nonce
 * 2. 用 XSalsa20-Poly1305 加密
 * 3. 組合：version (1 byte) + nonce (24 bytes) + ciphertext
 * 4. base64 編碼
 *
 * @param message - 明文訊息 (string)
 * @param key - 32 bytes 對稱金鑰
 * @returns base64 編碼的加密訊息
 */
export function encryptMessage(message: string, key: Uint8Array): string {
  // 產生隨機 nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // 加密
  const messageBytes = sodium.from_string(message);
  const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, key);

  // 組合：version + nonce + ciphertext
  const result = new Uint8Array(1 + nonce.length + ciphertext.length);
  result[0] = MESSAGE_VERSION;
  result.set(nonce, 1);
  result.set(ciphertext, 1 + nonce.length);

  // base64 編碼
  return sodium.to_base64(result, sodium.base64_variants.ORIGINAL);
}

/**
 * 對稱解密訊息
 *
 * 流程：
 * 1. base64 解碼
 * 2. 解析 version, nonce, ciphertext
 * 3. 驗證 version
 * 4. 用 XSalsa20-Poly1305 解密
 *
 * @param encryptedMessage - base64 編碼的加密訊息
 * @param key - 32 bytes 對稱金鑰
 * @returns 明文訊息，解密失敗回傳 null
 */
export function decryptMessage(
  encryptedMessage: string,
  key: Uint8Array
): string | null {
  try {
    // base64 解碼
    const data = sodium.from_base64(encryptedMessage, sodium.base64_variants.ORIGINAL);

    // 解析 version
    const version = data[0];
    if (version !== MESSAGE_VERSION) {
      console.warn(`Unknown message version: ${version}`);
      return null;
    }

    // 解析 nonce 和 ciphertext
    const nonce = data.slice(1, 1 + sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = data.slice(1 + sodium.crypto_secretbox_NONCEBYTES);

    // 解密
    const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    return sodium.to_string(decrypted);
  } catch {
    return null;
  }
}

// ============================================
// Utility
// ============================================

/**
 * Uint8Array 轉 base64 string
 */
export function toBase64(data: Uint8Array): string {
  return sodium.to_base64(data, sodium.base64_variants.ORIGINAL);
}

/**
 * base64 string 轉 Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
  return sodium.from_base64(base64, sodium.base64_variants.ORIGINAL);
}
