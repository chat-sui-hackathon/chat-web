'use client'

import { useConnectWallet, useWallets, useCurrentAccount } from '@mysten/dapp-kit'
import { useCallback, useState } from 'react'

type LoginMethod = 'wallet' | 'zklogin' | null

interface LoginOptionsProps {
  onLoginMethodChange?: (method: LoginMethod) => void
}

/**
 * 登入選項元件
 * 提供兩種登入方式：
 * 1. 傳統錢包 (Sui Wallet, Suiet 等)
 * 2. zkLogin (Google OAuth via Enoki)
 */
export function LoginOptions({ onLoginMethodChange }: LoginOptionsProps) {
  const wallets = useWallets()
  const { mutate: connectWallet, isPending } = useConnectWallet()
  const account = useCurrentAccount()
  const [selectedMethod, setSelectedMethod] = useState<LoginMethod>(null)

  // 分類錢包：zkLogin vs 傳統錢包
  const zkLoginWallets = wallets.filter(w => w.name.toLowerCase().includes('google') || w.name.toLowerCase().includes('enoki'))
  const traditionalWallets = wallets.filter(w => !w.name.toLowerCase().includes('google') && !w.name.toLowerCase().includes('enoki'))

  const handleWalletConnect = useCallback((wallet: typeof wallets[0]) => {
    const isZkLogin = zkLoginWallets.includes(wallet)
    setSelectedMethod(isZkLogin ? 'zklogin' : 'wallet')
    onLoginMethodChange?.(isZkLogin ? 'zklogin' : 'wallet')

    connectWallet({ wallet })
  }, [connectWallet, zkLoginWallets, onLoginMethodChange])

  if (account) {
    return null
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* zkLogin 選項 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Quick Login
        </h3>
        {zkLoginWallets.length > 0 ? (
          zkLoginWallets.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => handleWalletConnect(wallet)}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {wallet.icon && (
                <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
              )}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {isPending && selectedMethod === 'zklogin' ? 'Connecting...' : `Continue with ${wallet.name.replace('Enoki ', '')}`}
              </span>
            </button>
          ))
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            zkLogin not configured. Set NEXT_PUBLIC_ENOKI_PUBLIC_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local
          </div>
        )}
      </div>

      {/* 分隔線 */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white dark:bg-black text-zinc-500 dark:text-zinc-400">
            or
          </span>
        </div>
      </div>

      {/* 傳統錢包選項 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          Connect Wallet
        </h3>
        {traditionalWallets.length > 0 ? (
          <div className="space-y-2">
            {traditionalWallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => handleWalletConnect(wallet)}
                disabled={isPending}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {wallet.icon && (
                  <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
                )}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {wallet.name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            No wallets detected. Install a Sui wallet extension.
          </div>
        )}
      </div>
    </div>
  )
}
