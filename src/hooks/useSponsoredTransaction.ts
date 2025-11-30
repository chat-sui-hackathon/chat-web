'use client'

import { useCallback, useState } from 'react'
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@/lib/crypto'

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
 * 流程（用戶先簽名，更安全）：
 * 1. 用戶建立交易（知道自己在簽什麼）
 * 2. 用戶用 ephemeral key 簽名（無錢包 popup，如果是 zkLogin）
 * 3. 把「用戶簽名 + 交易」傳到後端
 * 4. 後端加 gas + sponsor 簽名
 * 5. 兩個簽名一起提交到鏈上
 *
 * 安全性：
 * - 用戶先簽名，知道自己在簽什麼
 * - 後端只能加 gas，無法修改交易內容（否則用戶簽名會失效）
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
        const txBytes = await transaction.build({
          client: suiClient,
          onlyTransactionKind: true,
        })

        // 3. 用戶先簽名（用 ephemeral key，如果是 zkLogin 則無 popup）
        const { signature: userSignature } = await signTransaction({
          transaction,
        })

        // 4. 把「用戶簽名 + 交易」傳到後端進行 sponsorship
        const response = await fetch('/api/sponsor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txBytes: toBase64(txBytes),
            userSignature,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Sponsor failed: ${response.status}`)
        }

        const result: SponsoredTransactionResult = await response.json()

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
