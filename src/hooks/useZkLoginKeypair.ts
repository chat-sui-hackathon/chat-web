'use client'

import { useCallback, useState, useEffect } from 'react'
import { useCurrentWallet } from '@mysten/dapp-kit'
import {
  deriveEncryptionKeypairFromZkLogin,
  initCrypto,
  toBase64,
  type Keypair,
  type ZkLoginClaims,
} from '@/lib/crypto'
import {
  getZkLoginSessionData,
  fetchUserSalt,
  isJwtExpired,
} from '@/lib/zklogin'
import { useAuthMethod } from './useAuthMethod'

// ============================================
// Types
// ============================================

export type ZkLoginKeypairState = {
  keypair: Keypair | null
  publicKeyBase64: string | null
  isLoading: boolean
  error: Error | null
}

export type UseZkLoginKeypairOptions = {
  /** 自動在連接時衍生 keypair（預設 false） */
  autoDerive?: boolean
  /** 衍生成功時的 callback */
  onSuccess?: (keypair: Keypair) => void
  /** 衍生失敗時的 callback */
  onError?: (error: Error) => void
}

// ============================================
// Hook
// ============================================

/**
 * 用於從 zkLogin session 衍生加密 keypair 的 hook
 *
 * 使用方式：
 * ```tsx
 * const { keypair, publicKeyBase64, derive, isLoading, error } = useZkLoginKeypair()
 *
 * // 手動衍生
 * const handleClick = async () => {
 *   const result = await derive()
 *   if (result) {
 *     console.log('Public key:', result.publicKeyBase64)
 *   }
 * }
 *
 * // 或自動衍生
 * const { keypair } = useZkLoginKeypair({ autoDerive: true })
 * ```
 *
 * 注意：
 * - 只有 zkLogin 連接才能使用此 hook
 * - keypair 每次衍生都會相同（基於穩定的 JWT claims + userSalt）
 * - 自動衍生會在錢包連接後觸發
 */
export function useZkLoginKeypair(options?: UseZkLoginKeypairOptions) {
  const { autoDerive = false, onSuccess, onError } = options || {}

  const [state, setState] = useState<ZkLoginKeypairState>({
    keypair: null,
    publicKeyBase64: null,
    isLoading: false,
    error: null,
  })

  const { currentWallet } = useCurrentWallet()
  const { isZkLogin } = useAuthMethod()

  /**
   * 衍生 keypair
   * @returns { keypair, publicKeyBase64 } 或 null（如果失敗）
   */
  const derive = useCallback(async (): Promise<{
    keypair: Keypair
    publicKeyBase64: string
  } | null> => {
    if (!isZkLogin) {
      const err = new Error('Not connected with zkLogin')
      setState(prev => ({ ...prev, error: err }))
      onError?.(err)
      return null
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // 確保 crypto 已初始化
      await initCrypto()

      // 1. 從錢包取得 session 資料
      const sessionData = await getZkLoginSessionData(currentWallet)
      if (!sessionData) {
        throw new Error('Could not get zkLogin session data. Try reconnecting.')
      }

      // 2. 檢查 JWT 是否過期
      if (isJwtExpired(sessionData.jwt)) {
        throw new Error('JWT has expired. Please reconnect.')
      }

      // 3. 取得 userSalt
      const { userSalt } = await fetchUserSalt(sessionData.jwt)

      // 4. 衍生 keypair
      const claims: ZkLoginClaims = {
        sub: sessionData.sub,
        iss: sessionData.iss,
        aud: sessionData.aud,
        userSalt,
      }
      const keypair = await deriveEncryptionKeypairFromZkLogin(claims)
      const publicKeyBase64 = toBase64(keypair.publicKey)

      setState({
        keypair,
        publicKeyBase64,
        isLoading: false,
        error: null,
      })

      onSuccess?.(keypair)
      return { keypair, publicKeyBase64 }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setState(prev => ({ ...prev, isLoading: false, error }))
      onError?.(error)
      return null
    }
  }, [currentWallet, isZkLogin, onSuccess, onError])

  /**
   * 清除 keypair 狀態
   */
  const clear = useCallback(() => {
    setState({
      keypair: null,
      publicKeyBase64: null,
      isLoading: false,
      error: null,
    })
  }, [])

  // 自動衍生（如果啟用）
  useEffect(() => {
    if (autoDerive && isZkLogin && currentWallet && !state.keypair && !state.isLoading) {
      derive()
    }
  }, [autoDerive, isZkLogin, currentWallet, state.keypair, state.isLoading, derive])

  // 連接變更時清除
  useEffect(() => {
    if (!isZkLogin) {
      clear()
    }
  }, [isZkLogin, clear])

  return {
    ...state,
    derive,
    clear,
    isZkLogin,
  }
}
