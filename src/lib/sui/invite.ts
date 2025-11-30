// Utilities for inviting users to encrypted chat rooms

import { initCrypto, decryptWithSecretKey, encryptWithPublicKey, fromBase64 } from '@/lib/crypto';
import { getEncryptedKeyFromChatRoom } from './chat';

/**
 * Prepare encrypted key for inviting a user to an encrypted chat room
 * 
 * Flow:
 * 1. Get invitee's profile to get their public_key
 * 2. Get encrypted_key from chat room (encrypted with inviter's public key)
 * 3. Decrypt the encrypted_key using inviter's private key to get decrypted_message_key
 * 4. Encrypt decrypted_message_key with invitee's public_key
 * 5. Return the encrypted key for invite_to_chat transaction
 * 
 * @param client - Sui client instance
 * @param chatId - Chat room ID
 * @param inviterAddress - Address of the user inviting (current user)
 * @param inviterSecretKey - Private key of the inviter
 * @param inviteeAddress - Address of the user being invited
 * @param inviteePublicKey - Public key of the invitee (from their profile)
 * @returns Encrypted key for the invitee, or null if failed
 */
export async function prepareEncryptedKeyForInvite(
    client: any,
    chatId: string,
    inviterAddress: string,
    inviterSecretKey: Uint8Array,
    inviteePublicKey: Uint8Array
): Promise<Uint8Array | null> {
    try {
        // Initialize crypto
        await initCrypto();

        // Step 1: Get encrypted_key from chat room (encrypted with inviter's public key)
        const encryptedKey = await getEncryptedKeyFromChatRoom(client, chatId, inviterAddress);

        if (!encryptedKey) {
            console.error('[prepareEncryptedKeyForInvite] Failed to get encrypted key from chat room');
            return null;
        }

        // Step 2: Decrypt the encrypted_key using inviter's private key to get decrypted_message_key
        const decryptedMessageKey = decryptWithSecretKey(encryptedKey, inviterSecretKey);

        if (!decryptedMessageKey) {
            console.error('[prepareEncryptedKeyForInvite] Failed to decrypt encrypted key');
            return null;
        }

        // Step 3: Encrypt decrypted_message_key with invitee's public_key
        const encryptedKeyForInvitee = encryptWithPublicKey(decryptedMessageKey, inviteePublicKey);

        return encryptedKeyForInvitee;
    } catch (error) {
        console.error('[prepareEncryptedKeyForInvite] Error:', error);
        return null;
    }
}

/**
 * Helper to convert profile public key to Uint8Array
 */
export function parsePublicKey(publicKey: Uint8Array | string | number[]): Uint8Array | null {
    try {
        if (typeof publicKey === 'string') {
            // Try base64 first
            try {
                return fromBase64(publicKey);
            } catch {
                // Try hex
                try {
                    return new Uint8Array(
                        publicKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                    );
                } catch {
                    // Fallback: treat as raw string
                    return new TextEncoder().encode(publicKey);
                }
            }
        } else if (Array.isArray(publicKey)) {
            // If it's an array of numbers, convert to Uint8Array
            return new Uint8Array(publicKey);
        } else {
            // Already Uint8Array
            return publicKey;
        }
    } catch (error) {
        console.error('[parsePublicKey] Error:', error);
        return null;
    }
}

