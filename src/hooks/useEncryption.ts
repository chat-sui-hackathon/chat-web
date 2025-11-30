// Hook for encryption utilities

import { useState, useCallback, useEffect } from 'react';
import {
  initCrypto,
  deriveEncryptionKeypair,
  encryptMessage,
  decryptMessage,
  createRandomSymmetricKey,
  encryptWithPublicKey,
  decryptWithSecretKey,
  toBase64,
  fromBase64,
} from '@/lib/crypto';
import type { Keypair } from '@/lib/crypto';

/**
 * Hook to manage user's encryption keypair
 */
export function useEncryptionKeypair() {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initCrypto().then(() => {
      setIsInitialized(true);
    });
  }, []);

  const loadKeypair = useCallback(async (signature: Uint8Array) => {
    await initCrypto();
    const kp = await deriveEncryptionKeypair(signature);
    setKeypair(kp);
    return kp;
  }, []);

  const getPublicKeyBase64 = useCallback(() => {
    if (!keypair) return null;
    return toBase64(keypair.publicKey);
  }, [keypair]);

  return {
    keypair,
    isInitialized,
    loadKeypair,
    getPublicKeyBase64,
  };
}

/**
 * Hook for room encryption (private chats)
 */
export function useRoomEncryption(roomKey: Uint8Array | null) {
  const encrypt = useCallback(
    (message: string): string | null => {
      if (!roomKey) return null;
      return encryptMessage(message, roomKey);
    },
    [roomKey]
  );

  const decrypt = useCallback(
    (encryptedMessage: string): string | null => {
      if (!roomKey) return null;
      return decryptMessage(encryptedMessage, roomKey);
    },
    [roomKey]
  );

  return { encrypt, decrypt };
}

/**
 * Hook to create and manage room encryption keys
 */
export function useRoomKey() {
  const createRoomKey = useCallback((): Uint8Array => {
    return createRandomSymmetricKey();
  }, []);

  const encryptKeyForUser = useCallback(
    (roomKey: Uint8Array, userPublicKey: Uint8Array): string => {
      const encrypted = encryptWithPublicKey(roomKey, userPublicKey);
      return toBase64(encrypted);
    },
    []
  );

  const decryptKeyForUser = useCallback(
    (encryptedKey: string, userSecretKey: Uint8Array): Uint8Array | null => {
      const encrypted = fromBase64(encryptedKey);
      return decryptWithSecretKey(encrypted, userSecretKey);
    },
    []
  );

  return {
    createRoomKey,
    encryptKeyForUser,
    decryptKeyForUser,
  };
}

/**
 * Hook to prepare invitation for encrypted chat room
 * This handles the full flow of preparing encrypted key for invitee
 */
export function useInviteToEncryptedChat() {
  const prepareInvite = useCallback(async (
    client: any,
    chatId: string,
    inviterAddress: string,
    inviterKeypair: Keypair,
    inviteePublicKey: Uint8Array | string | number[]
  ): Promise<Uint8Array | null> => {
    await initCrypto();

    // Parse invitee's public key using the utility function
    const { parsePublicKey } = await import('@/lib/sui/invite');
    const inviteePublicKeyBytes = parsePublicKey(inviteePublicKey);

    if (!inviteePublicKeyBytes || inviteePublicKeyBytes.length !== 32) {
      console.error('[useInviteToEncryptedChat] Invalid invitee public key');
      return null;
    }

    // Import the prepareEncryptedKeyForInvite function
    const { prepareEncryptedKeyForInvite } = await import('@/lib/sui/invite');

    return prepareEncryptedKeyForInvite(
      client,
      chatId,
      inviterAddress,
      inviterKeypair.secretKey,
      inviteePublicKeyBytes
    );
  }, []);

  return { prepareInvite };
}

