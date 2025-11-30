'use client'

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl } from '@mysten/sui/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiInitializer } from '@/lib/enoki/EnokiInitializer'

// 從環境變數取得預設網路
const defaultNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet') as 'testnet' | 'devnet' | 'mainnet' | 'localnet'

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl('localnet') },
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
        <WalletProvider autoConnect>
          {/* 初始化 Enoki zkLogin 錢包 */}
          <EnokiInitializer />
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  )
}

