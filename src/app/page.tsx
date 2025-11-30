'use client'

import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { Header } from '@/components/common'
import { LoginOptions } from '@/components/auth'
import { useAuthMethod, useSponsoredTransaction } from '@/hooks'

export default function Home() {
  const account = useCurrentAccount()
  const { authMethod, isZkLogin } = useAuthMethod()
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction()
  const { execute: executeSponsoredTx, isPending: isSponsoredPending } = useSponsoredTransaction()

  // Query owned objects for the connected account
  const { data: ownedObjects, isPending, error } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address || '',
      options: {
        showType: true,
        showContent: true,
        showDisplay: true,
      },
    },
    {
      enabled: !!account?.address,
    },
  )

  const handleTestTransaction = () => {
    if (!account) {
      alert('Please connect your wallet first')
      return
    }

    const tx = new Transaction()
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1000)])
    tx.transferObjects([coin], account.address)

    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log('Transaction executed successfully:', result)
          alert(`Transaction successful! Digest: ${result.digest}`)
        },
        onError: (error) => {
          console.error('Transaction failed:', error)
          alert(`Transaction failed: ${error.message}`)
        },
      },
    )
  }

  const handleSponsoredTransaction = async () => {
    if (!account) {
      alert('Please connect your wallet first')
      return
    }

    const tx = new Transaction()
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1000)])
    tx.transferObjects([coin], account.address)

    const result = await executeSponsoredTx(tx)
    if (result.success) {
      alert(`Sponsored transaction successful! Digest: ${result.digest}`)
    } else {
      alert(`Sponsored transaction failed: ${result.error}`)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Header />

      <main className="flex flex-1 flex-col items-center justify-start py-12 px-8">
        <div className="w-full max-w-2xl">
          {account ? (
            <div className="space-y-6">
              {/* Auth method info */}
              <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                  Connection Info
                </h2>
                <div className="space-y-2 text-sm">
                  <p className="text-zinc-600 dark:text-zinc-400">
                    <strong>Address:</strong>{' '}
                    <span className="font-mono break-all">{account.address}</span>
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    <strong>Auth Method:</strong>{' '}
                    <span className={isZkLogin ? 'text-blue-600' : 'text-green-600'}>
                      {isZkLogin ? 'zkLogin (Google)' : 'Traditional Wallet'}
                    </span>
                  </p>
                  {isZkLogin && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2">
                      zkLogin uses ephemeral keys - no wallet popups for transactions!
                    </p>
                  )}
                </div>
              </div>

              {/* Owned Objects */}
              <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                  Owned Objects
                </h2>
                {isPending && <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>}
                {error && (
                  <p className="text-red-600 dark:text-red-400">
                    Error: {error.message}
                  </p>
                )}
                {ownedObjects && (
                  <div className="space-y-2">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Total objects: {ownedObjects.data.length}
                    </p>
                    {ownedObjects.data.length > 0 ? (
                      <ul className="space-y-2 max-h-64 overflow-y-auto">
                        {ownedObjects.data.slice(0, 5).map((obj) => (
                          <li
                            key={obj.data?.objectId}
                            className="text-xs p-2 bg-white dark:bg-zinc-800 rounded break-all"
                          >
                            <strong>ID:</strong> {obj.data?.objectId}
                            <br />
                            <strong>Type:</strong> {obj.data?.type}
                          </li>
                        ))}
                        {ownedObjects.data.length > 5 && (
                          <li className="text-xs text-zinc-500 p-2">
                            ... and {ownedObjects.data.length - 5} more
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        No objects found
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Test Transactions */}
              <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                  Test Transactions
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                  Transfer 1000 MIST to yourself.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleTestTransaction}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Normal Transaction
                  </button>
                  <button
                    onClick={handleSponsoredTransaction}
                    disabled={isSponsoredPending}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {isSponsoredPending ? 'Processing...' : 'Sponsored Transaction'}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-3">
                  Sponsored transactions require ENOKI_PRIVATE_KEY configured on the backend.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-2">
                  Welcome to Sui Chat
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Choose how you&apos;d like to connect
                </p>
              </div>

              <LoginOptions />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
