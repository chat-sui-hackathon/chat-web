import type { Wallet } from '@mysten/wallet-standard'
import { getSession as getEnokiSession, isEnokiWallet } from '@mysten/enoki'

// ============================================
// Types
// ============================================

export type JwtPayload = {
  sub: string      // Subject - 用戶在 OAuth provider 的唯一 ID
  iss: string      // Issuer - OAuth provider URL
  aud: string | string[]  // Audience - 應用的 OAuth client ID
  exp?: number     // Expiration time
  iat?: number     // Issued at
  [key: string]: unknown
}

export type ZkLoginSessionData = {
  jwt: string
  sub: string
  iss: string
  aud: string
}

// ============================================
// JWT Utilities
// ============================================

/**
 * 解碼 JWT payload（不驗證簽名）
 *
 * @param jwt - JWT token string
 * @returns 解碼後的 payload，失敗回傳 null
 */
export function decodeJwtPayload(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    // Handle base64url encoding
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * 檢查 JWT 是否過期
 *
 * @param jwt - JWT token string
 * @returns true 如果過期或無效
 */
export function isJwtExpired(jwt: string): boolean {
  const payload = decodeJwtPayload(jwt)
  if (!payload || !payload.exp) return true

  // exp 是秒數，Date.now() 是毫秒
  return Date.now() >= payload.exp * 1000
}

// ============================================
// Enoki Session
// ============================================

/**
 * 從 Enoki 錢包取得 JWT
 *
 * @param wallet - 已連接的錢包（從 useCurrentWallet 取得）
 * @returns JWT string，失敗回傳 null
 */
export async function getJwtFromWallet(wallet: Wallet | null): Promise<string | null> {
  if (!wallet) {
    console.log('[zklogin] No wallet provided')
    return null
  }

  if (!isEnokiWallet(wallet)) {
    console.log('[zklogin] Wallet is not an Enoki wallet:', wallet.name)
    return null
  }

  try {
    const session = await getEnokiSession(wallet)
    if (!session?.jwt) {
      console.log('[zklogin] Wallet session has no JWT')
      return null
    }
    return session.jwt
  } catch (e) {
    console.error('[zklogin] Error getting session from wallet:', e)
    return null
  }
}

/**
 * 從 Enoki 錢包取得完整的 zkLogin session 資料
 * 包含 JWT 和解析後的 claims
 *
 * @param wallet - 已連接的錢包
 * @returns ZkLoginSessionData，失敗回傳 null
 */
export async function getZkLoginSessionData(wallet: Wallet | null): Promise<ZkLoginSessionData | null> {
  const jwt = await getJwtFromWallet(wallet)
  if (!jwt) return null

  const payload = decodeJwtPayload(jwt)
  if (!payload) {
    console.error('[zklogin] Failed to decode JWT payload')
    return null
  }

  const { sub, iss, aud } = payload
  if (!sub || !iss || !aud) {
    console.error('[zklogin] JWT missing required claims:', { sub, iss, aud })
    return null
  }

  return {
    jwt,
    sub,
    iss,
    aud: Array.isArray(aud) ? aud[0] : aud,
  }
}

// ============================================
// User Salt
// ============================================

/**
 * 從 Enoki API 取得 userSalt
 *
 * @param jwt - 有效的 JWT token
 * @returns userSalt string 和 address，失敗拋出錯誤
 */
export async function fetchUserSalt(jwt: string): Promise<{ userSalt: string; address: string }> {
  const response = await fetch('/api/zklogin/salt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to get salt: ${response.status}`)
  }

  const data = await response.json()

  if (!data.userSalt) {
    throw new Error('userSalt not found in response')
  }

  return {
    userSalt: data.userSalt,
    address: data.address,
  }
}
