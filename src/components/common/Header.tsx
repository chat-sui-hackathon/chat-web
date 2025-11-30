'use client'

import { useDisconnectWallet, useCurrentAccount, useWallets, useConnectWallet } from '@mysten/dapp-kit'
import Link from 'next/link'
import { useUser } from '@/hooks/useUser'
import { useCallback } from 'react'

interface HeaderProps {
  title?: string
}

/**
 * Header component with authentication status and navigation
 * Only supports zkLogin (Google OAuth)
 */
export function Header({ title = 'Sui Chat' }: HeaderProps) {
  const account = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const { profile } = useUser()
  const wallets = useWallets()
  const { mutate: connectWallet, isPending } = useConnectWallet()

  // 只顯示 zkLogin 錢包
  const zkLoginWallet = wallets.find(
    w => w.name.toLowerCase().includes('google') || w.name.toLowerCase().includes('enoki')
  )

  const handleConnect = useCallback(() => {
    if (zkLoginWallet) {
      connectWallet({ wallet: zkLoginWallet })
    }
  }, [connectWallet, zkLoginWallet])

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <header className="relative z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-black/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Title */}
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-semibold text-black dark:text-zinc-50">
              Iceb3rg
            </Link>
          </div>

          {/* Navigation and Auth */}
          <nav className="flex items-center space-x-4">
            {account && profile && (
              <>
                <Link
                  href="/rooms"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50"
                >
                  Rooms
                </Link>
                <Link
                  href="/users"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50"
                >
                  Users
                </Link>
                <Link
                  href={`/users/${account.address}`}
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50 transition-colors"
                >
                  {profile.displayName}
                </Link>
              </>
            )}

            {account ? (
              <div className="flex items-center gap-3">
                {/* Disconnect button */}
                <button
                  onClick={() => disconnect()}
                  className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isPending || !zkLoginWallet}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Connecting...' : 'Sign in with Google'}
              </button>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
