'use client'

import { useState, useCallback } from 'react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSponsoredTransaction } from './useSponsoredTransaction'
import { useZkLoginKeypair } from './useZkLoginKeypair'
import { inviteToChatTransaction } from '@/lib/sui/chat'
import { prepareEncryptedKeyForInvite, parsePublicKey } from '@/lib/sui/invite'
import type { Profile } from '@/lib/types'

export type InviteResult = {
  success: boolean
  digest?: string
  error?: string
}

/**
 * Hook for inviting members to chat rooms
 *
 * - For non-encrypted rooms: direct invite without key sharing
 * - For encrypted rooms: decrypt room key and re-encrypt for invitee
 */
export function useInviteMember() {
  const account = useCurrentAccount()
  const client = useSuiClient()
  const { execute: executeSponsoredTx, isPending: isExecuting } = useSponsoredTransaction()
  const { derive: deriveKeypair } = useZkLoginKeypair()

  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Invite a member to a non-encrypted (public) chat room
   */
  const inviteToPublicRoom = useCallback(async (
    chatId: string,
    inviteeProfile: Profile
  ): Promise<InviteResult> => {
    console.log('[useInviteMember] Inviting to public room:', {
      chatId,
      invitee: inviteeProfile.owner,
      inviteeDisplayName: inviteeProfile.displayName,
    })

    if (!inviteeProfile.chatIndexId) {
      return { success: false, error: 'Invitee does not have a chat index' }
    }

    const tx = new Transaction()
    inviteToChatTransaction(tx, chatId, inviteeProfile.chatIndexId, new Uint8Array(0))

    const result = await executeSponsoredTx(tx)

    if (result.success) {
      console.log('[useInviteMember] Invite successful:', result.digest)
      return { success: true, digest: result.digest }
    } else {
      console.error('[useInviteMember] Invite failed:', result.error)
      return { success: false, error: result.error }
    }
  }, [executeSponsoredTx])

  /**
   * Invite a member to an encrypted chat room
   * This requires decrypting the room key and re-encrypting for the invitee
   */
  const inviteToEncryptedRoom = useCallback(async (
    chatId: string,
    inviteeProfile: Profile
  ): Promise<InviteResult> => {
    console.log('[useInviteMember] Inviting to encrypted room:', {
      chatId,
      invitee: inviteeProfile.owner,
      inviteeDisplayName: inviteeProfile.displayName,
    })

    if (!account?.address) {
      return { success: false, error: 'Not connected' }
    }

    if (!inviteeProfile.chatIndexId) {
      return { success: false, error: 'Invitee does not have a chat index' }
    }

    if (!inviteeProfile.publicKey) {
      return { success: false, error: 'Invitee does not have a public key' }
    }

    // Step 1: Derive inviter's keypair to get secret key
    console.log('[useInviteMember] Step 1: Deriving keypair...')
    const keypairResult = await deriveKeypair()
    if (!keypairResult || !keypairResult.keypair) {
      return { success: false, error: 'Failed to derive encryption keypair' }
    }
    console.log('[useInviteMember] Step 1: Keypair derived')

    // Step 2: Parse invitee's public key
    console.log('[useInviteMember] Step 2: Parsing invitee public key...')
    const inviteePublicKey = parsePublicKey(inviteeProfile.publicKey)
    if (!inviteePublicKey) {
      return { success: false, error: 'Invalid invitee public key' }
    }
    if (inviteePublicKey.length !== 32) {
      return { success: false, error: `Invalid public key length: ${inviteePublicKey.length} bytes (expected 32)` }
    }
    console.log('[useInviteMember] Step 2: Invitee public key parsed')

    // Step 3: Prepare encrypted key for invitee
    console.log('[useInviteMember] Step 3: Preparing encrypted key for invitee...')
    const encryptedKeyForInvitee = await prepareEncryptedKeyForInvite(
      client,
      chatId,
      account.address,
      keypairResult.keypair.secretKey,
      inviteePublicKey
    )

    if (!encryptedKeyForInvitee) {
      return { success: false, error: 'Failed to prepare encrypted key for invitee' }
    }
    console.log('[useInviteMember] Step 3: Encrypted key prepared')

    // Step 4: Execute invite transaction
    console.log('[useInviteMember] Step 4: Executing invite transaction...')
    const tx = new Transaction()
    inviteToChatTransaction(tx, chatId, inviteeProfile.chatIndexId, encryptedKeyForInvitee)

    const result = await executeSponsoredTx(tx)

    if (result.success) {
      console.log('[useInviteMember] Invite successful:', result.digest)
      return { success: true, digest: result.digest }
    } else {
      console.error('[useInviteMember] Invite failed:', result.error)
      return { success: false, error: result.error }
    }
  }, [account, client, deriveKeypair, executeSponsoredTx])

  /**
   * Invite a member to a chat room
   * Automatically handles encrypted vs non-encrypted rooms
   */
  const inviteMember = useCallback(async (
    chatId: string,
    inviteeProfile: Profile,
    isEncrypted: boolean
  ): Promise<InviteResult> => {
    console.log('[useInviteMember] === Starting invite ===')
    console.log('[useInviteMember] isEncrypted:', isEncrypted)

    setIsInviting(true)
    setError(null)

    try {
      const result = isEncrypted
        ? await inviteToEncryptedRoom(chatId, inviteeProfile)
        : await inviteToPublicRoom(chatId, inviteeProfile)

      if (!result.success && result.error) {
        setError(new Error(result.error))
      }

      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[useInviteMember] Error:', error.message)
      setError(error)
      return { success: false, error: error.message }
    } finally {
      setIsInviting(false)
      console.log('[useInviteMember] === End ===')
    }
  }, [inviteToEncryptedRoom, inviteToPublicRoom])

  return {
    inviteMember,
    inviteToPublicRoom,
    inviteToEncryptedRoom,
    isInviting: isInviting || isExecuting,
    error,
  }
}
