'use client'

import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit'
import { useMemo } from 'react'

export type AuthMethod = 'wallet' | 'zklogin' | null

/**
 * Hook to detect current authentication method
 * Returns 'zklogin' if connected via Enoki/Google, 'wallet' for traditional wallets
 */
export function useAuthMethod(): {
  authMethod: AuthMethod
  isZkLogin: boolean
  isWallet: boolean
  isConnected: boolean
  address: string | undefined
} {
  const account = useCurrentAccount()
  const { currentWallet } = useCurrentWallet()

  const authMethod = useMemo<AuthMethod>(() => {
    if (!currentWallet || !account) return null

    const walletName = currentWallet.name.toLowerCase()
    if (walletName.includes('google') || walletName.includes('enoki')) {
      return 'zklogin'
    }
    return 'wallet'
  }, [currentWallet, account])

  return {
    authMethod,
    isZkLogin: authMethod === 'zklogin',
    isWallet: authMethod === 'wallet',
    isConnected: !!account,
    address: account?.address,
  }
}
