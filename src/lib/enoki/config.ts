import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'
import { registerEnokiWallets } from '@mysten/enoki'
import type { EnokiNetwork } from '@mysten/enoki'

// Network configuration
export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as EnokiNetwork

// Create SuiClient for Enoki
const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) })

/**
 * 註冊 Enoki zkLogin 錢包
 * 必須在客戶端執行一次
 */
export function initEnokiWallets() {
  if (typeof window === 'undefined') return

  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  if (!apiKey) {
    console.warn('NEXT_PUBLIC_ENOKI_PUBLIC_KEY not set, Enoki wallets disabled')
    return
  }

  if (!googleClientId) {
    console.warn('NEXT_PUBLIC_GOOGLE_CLIENT_ID not set, Google login disabled')
    return
  }

  registerEnokiWallets({
    apiKey,
    client: suiClient,
    network: NETWORK,
    providers: {
      google: {
        clientId: googleClientId,
        redirectUrl: `${window.location.origin}/auth/callback`,
      },
    },
  })
}
