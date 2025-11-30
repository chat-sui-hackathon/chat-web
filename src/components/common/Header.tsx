'use client'

import { ConnectButton, useDisconnectWallet, useCurrentAccount } from '@mysten/dapp-kit'
import { useAuthMethod } from '@/hooks/useAuthMethod'

interface HeaderProps {
  title?: string
}

/**
 * Header component with authentication status
 * Shows different UI for zkLogin vs wallet users
 */
export function Header({ title = 'Sui Chat' }: HeaderProps) {
  const account = useCurrentAccount()
  const { authMethod, isZkLogin } = useAuthMethod()
  const { mutate: disconnect } = useDisconnectWallet()

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <header className="w-full flex justify-between items-center py-4 px-6 border-b border-zinc-200 dark:border-zinc-800">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        {title}
      </h1>

      <div className="flex items-center gap-4">
        {account ? (
          <div className="flex items-center gap-3">
            {/* Login method badge */}
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                isZkLogin
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              }`}
            >
              {isZkLogin ? 'zkLogin' : 'Wallet'}
            </span>

            {/* Address display */}
            <span className="text-sm text-zinc-600 dark:text-zinc-400 font-mono">
              {truncateAddress(account.address)}
            </span>

            {/* Disconnect button */}
            <button
              onClick={() => disconnect()}
              className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  )
}
