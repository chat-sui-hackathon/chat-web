'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { useZkLoginKeypair } from './useZkLoginKeypair'
import { getEncryptedKeyFromChatRoom } from '@/lib/sui/chat'
import { initCrypto, decryptWithSecretKey } from '@/lib/crypto'

export type RoomKeyState = {
  roomKey: Uint8Array | null
  isLoading: boolean
  error: Error | null
  isDecrypted: boolean
}

/**
 * Hook to decrypt the room key for an encrypted chat room
 *
 * Flow:
 * 1. Derive user's keypair using zkLogin
 * 2. Fetch encrypted key from chat room's dynamic field
 * 3. Decrypt with user's secret key to get room key
 */
export function useRoomKeyDecryption(chatId: string | null, isEncrypted: boolean) {
  const account = useCurrentAccount()
  const client = useSuiClient()
  const { derive: deriveKeypair } = useZkLoginKeypair()

  const [state, setState] = useState<RoomKeyState>({
    roomKey: null,
    isLoading: false,
    error: null,
    isDecrypted: false,
  })

  /**
   * Decrypt the room key
   */
  const decryptRoomKey = useCallback(async (): Promise<Uint8Array | null> => {
    console.log('[useRoomKeyDecryption] === Starting room key decryption ===')
    console.log('[useRoomKeyDecryption] chatId:', chatId)
    console.log('[useRoomKeyDecryption] isEncrypted:', isEncrypted)
    console.log('[useRoomKeyDecryption] account:', account?.address)

    if (!chatId || !isEncrypted || !account?.address) {
      console.log('[useRoomKeyDecryption] Skipping: missing chatId, not encrypted, or no account')
      return null
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Step 1: Initialize crypto
      console.log('[useRoomKeyDecryption] Step 1: Initializing crypto...')
      await initCrypto()

      // Step 2: Derive keypair to get secret key
      console.log('[useRoomKeyDecryption] Step 2: Deriving keypair...')
      const keypairResult = await deriveKeypair()
      if (!keypairResult || !keypairResult.keypair) {
        throw new Error('Failed to derive encryption keypair')
      }
      console.log('[useRoomKeyDecryption] Step 2: Keypair derived')

      // Step 3: Get encrypted key from chat room
      console.log('[useRoomKeyDecryption] Step 3: Fetching encrypted key from chat room...')
      const encryptedKey = await getEncryptedKeyFromChatRoom(client, chatId, account.address)
      if (!encryptedKey) {
        throw new Error('Failed to get encrypted key from chat room. You may not be a member.')
      }
      console.log('[useRoomKeyDecryption] Step 3: Encrypted key fetched, length:', encryptedKey.length)

      // Step 4: Decrypt the room key
      console.log('[useRoomKeyDecryption] Step 4: Decrypting room key...')
      const roomKey = decryptWithSecretKey(encryptedKey, keypairResult.keypair.secretKey)
      if (!roomKey) {
        throw new Error('Failed to decrypt room key. Key may be corrupted.')
      }
      console.log('[useRoomKeyDecryption] Step 4: Room key decrypted, length:', roomKey.length)

      setState({
        roomKey,
        isLoading: false,
        error: null,
        isDecrypted: true,
      })

      console.log('[useRoomKeyDecryption] === Room key decryption successful! ===')
      return roomKey
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[useRoomKeyDecryption] === Error ===', error.message)
      setState({
        roomKey: null,
        isLoading: false,
        error,
        isDecrypted: false,
      })
      return null
    }
  }, [chatId, isEncrypted, account, client, deriveKeypair])

  // Auto-decrypt when entering an encrypted room
  useEffect(() => {
    if (chatId && isEncrypted && account?.address && !state.isDecrypted && !state.isLoading) {
      decryptRoomKey()
    }
  }, [chatId, isEncrypted, account?.address, state.isDecrypted, state.isLoading, decryptRoomKey])

  // Reset state when leaving room or switching rooms
  useEffect(() => {
    return () => {
      setState({
        roomKey: null,
        isLoading: false,
        error: null,
        isDecrypted: false,
      })
    }
  }, [chatId])

  /**
   * Clear the room key (e.g., when leaving the room)
   */
  const clearRoomKey = useCallback(() => {
    setState({
      roomKey: null,
      isLoading: false,
      error: null,
      isDecrypted: false,
    })
  }, [])

  return {
    ...state,
    decryptRoomKey,
    clearRoomKey,
  }
}
