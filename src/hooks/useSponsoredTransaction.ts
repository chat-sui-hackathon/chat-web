'use client'

import { useCallback, useState } from 'react'
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64, fromBase64 } from '@/lib/crypto'

export type SponsoredTransactionResult = {
  success: boolean
  digest?: string
  effects?: unknown
  events?: unknown
  error?: string
}

export type UseSponsoredTransactionOptions = {
  onSuccess?: (result: SponsoredTransactionResult) => void
  onError?: (error: Error) => void
}

/**
 * 用於執行 sponsored transaction 的 hook
 *
 * 流程（適用於 0 balance 的 zkLogin 帳戶）：
 * 1. 用戶建立交易（知道自己在做什麼）
 * 2. 序列化 transaction kind（不含 gas）
 * 3. 傳到後端讓 Enoki sponsor（加上 gas 資訊）
 * 4. 用戶簽名 sponsored 後的完整交易
 * 5. 後端用兩個簽名執行交易
 *
 * 安全性：
 * - 用戶建立交易，知道自己在做什麼
 * - 用戶簽名的是包含 gas 資訊的完整交易，可以驗證
 */
export function useSponsoredTransaction(options?: UseSponsoredTransactionOptions) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutateAsync: signTransaction } = useSignTransaction()

  const execute = useCallback(
    async (transaction: Transaction): Promise<SponsoredTransactionResult> => {
      if (!account) {
        const err = new Error('No wallet connected')
        setError(err)
        options?.onError?.(err)
        return { success: false, error: err.message }
      }

      setIsPending(true)
      setError(null)

      try {
        // 1. 設定 sender
        transaction.setSender(account.address)

        // 2. 序列化交易（只有 transaction kind，不含 gas 資訊）
        const txKindBytes = await transaction.build({
          client: suiClient,
          onlyTransactionKind: true,
        })

        // 3. 先傳到後端讓 Enoki sponsor（取得包含 gas 的完整交易）
        const sponsorResponse = await fetch('/api/sponsor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txBytes: toBase64(txKindBytes),
            sender: account.address,
          }),
        })

        if (!sponsorResponse.ok) {
          const errorData = await sponsorResponse.json().catch(() => ({}))
          throw new Error(errorData.error || `Sponsor failed: ${sponsorResponse.status}`)
        }

        const sponsorData = await sponsorResponse.json()

        // Debug: log sponsor response
        console.log('Sponsor response:', sponsorData)

        if (!sponsorData.txBytes || !sponsorData.digest) {
          throw new Error(`Sponsor response missing txBytes or digest: ${JSON.stringify(sponsorData)}`)
        }

        // 4. 用戶簽名 sponsored 後的完整交易
        const sponsoredTxBytes = fromBase64(sponsorData.txBytes)
        const sponsoredTx = Transaction.from(sponsoredTxBytes)

        const { signature: userSignature } = await signTransaction({
          transaction: sponsoredTx,
        })

        // 5. 把 digest + 用戶簽名傳到後端，讓 Enoki 執行
        const executeResponse = await fetch('/api/sponsor/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            digest: sponsorData.digest,
            userSignature,
          }),
        })

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json().catch(() => ({}))
          throw new Error(errorData.error || `Execute failed: ${executeResponse.status}`)
        }

        const result: SponsoredTransactionResult = await executeResponse.json()

        if (result.success) {
          options?.onSuccess?.(result)
        }

        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        options?.onError?.(error)
        return { success: false, error: error.message }
      } finally {
        setIsPending(false)
      }
    },
    [account, suiClient, signTransaction, options]
  )

  return {
    execute,
    isPending,
    error,
  }
}
