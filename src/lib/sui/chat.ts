// Chat module contract interactions

import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { PACKAGE_ID, MODULES, APP_CONFIG_ID } from '../types';
import type { ChatRoom, UserChatIndex } from '../types';

const CHAT_MODULE = `${PACKAGE_ID}::${MODULES.CHAT}`;

/**
 * Create a transaction to create a chat room
 */
export function createChatTransaction(
    tx: Transaction,
    params: {
        userIndexId: string; // UserChatIndex object ID
        name: string;
        isEncrypted: boolean;
        encryptedKey: Uint8Array | string; // Empty array for public chats
    }
): TransactionResult {
    const encryptedKeyBytes = typeof params.encryptedKey === 'string'
        ? Array.from(new TextEncoder().encode(params.encryptedKey))
        : Array.from(params.encryptedKey);

    return tx.moveCall({
        target: `${CHAT_MODULE}::create_chat`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(params.userIndexId),
            tx.pure.string(params.name),
            tx.pure.bool(params.isEncrypted),
            tx.pure.vector('u8', encryptedKeyBytes),
            tx.object('0x6'), // Clock object
        ],
    });
}

/**
 * Create a transaction to join a public chat
 */
export function joinChatTransaction(
    tx: Transaction,
    chatId: string,
    userIndexId: string
): TransactionResult {
    return tx.moveCall({
        target: `${CHAT_MODULE}::join_chat`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(chatId),
            tx.object(userIndexId),
        ],
    });
}

/**
 * Create a transaction to invite a user to an encrypted chat
 */
export function inviteToChatTransaction(
    tx: Transaction,
    chatId: string,
    inviteeIndexId: string, // Invitee's UserChatIndex object ID
    encryptedKeyForInvitee: Uint8Array | string // Encrypted key for the invitee
): TransactionResult {
    const encryptedKeyBytes = typeof encryptedKeyForInvitee === 'string'
        ? Array.from(new TextEncoder().encode(encryptedKeyForInvitee))
        : Array.from(encryptedKeyForInvitee);

    return tx.moveCall({
        target: `${CHAT_MODULE}::invite_to_chat`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(chatId),
            tx.object(inviteeIndexId),
            tx.pure.vector('u8', encryptedKeyBytes),
        ],
    });
}

/**
 * Create a transaction to leave a chat room
 */
export function leaveChatTransaction(
    tx: Transaction,
    chatId: string,
    userIndexId: string
): TransactionResult {
    return tx.moveCall({
        target: `${CHAT_MODULE}::leave_chat`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(chatId),
            tx.object(userIndexId),
        ],
    });
}

/**
 * Create a transaction to block a user
 */
export function blockUserTransaction(
    tx: Transaction,
    userIndexId: string,
    targetAddress: string
): TransactionResult {
    return tx.moveCall({
        target: `${CHAT_MODULE}::block_user`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(userIndexId),
            tx.pure.address(targetAddress),
        ],
    });
}

/**
 * Create a transaction to unblock a user
 */
export function unblockUserTransaction(
    tx: Transaction,
    userIndexId: string,
    targetAddress: string
): TransactionResult {
    return tx.moveCall({
        target: `${CHAT_MODULE}::unblock_user`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(userIndexId),
            tx.pure.address(targetAddress),
        ],
    });
}

/**
 * Parse ChatRoom object from Sui object data
 */
export function parseChatObject(data: any): ChatRoom | null {
    if (!data) {
        console.warn('[parseChatObject] No data provided');
        return null;
    }

    // Handle different data structures from getObject vs getOwnedObjects
    let fields: any;
    let objectId: string;

    // Check if data has content directly (from getOwnedObjects)
    if (data.content && data.content.dataType === 'moveObject') {
        fields = data.content.fields;
        objectId = data.data?.objectId || data.objectId || '';
    }
    // Check if data is wrapped in a data property (from getObject)
    else if (data.data) {
        objectId = data.data.objectId || '';
        if (data.data.content && data.data.content.dataType === 'moveObject') {
            fields = data.data.content.fields;
        } else if (data.content && data.content.dataType === 'moveObject') {
            fields = data.content.fields;
        } else {
            console.warn('[parseChatObject] Invalid data structure:', {
                hasData: !!data,
                hasDataData: !!data.data,
                hasContent: !!data?.content,
                hasDataContent: !!data?.data?.content,
                contentType: data?.content?.dataType,
                dataContentType: data?.data?.content?.dataType,
                expectedType: 'moveObject'
            });
            return null;
        }
    }
    // Try direct fields access
    else if (data.fields) {
        fields = data.fields;
        objectId = data.objectId || '';
    }
    else {
        console.warn('[parseChatObject] Invalid data structure:', {
            hasData: !!data,
            hasContent: !!data?.content,
            hasDataData: !!data?.data,
            contentType: data?.content?.dataType,
            expectedType: 'moveObject'
        });
        return null;
    }

    if (!fields || !objectId) {
        console.warn('[parseChatObject] Missing required fields:', {
            hasFields: !!fields,
            hasObjectId: !!objectId
        });
        return null;
    }

    // Parse members from VecSet<address> - Sui serializes VecSet as an array
    // Always use members.length to get the count, not a separate field
    let members: string[] = [];
    if (fields.members) {
        if (Array.isArray(fields.members)) {
            members = fields.members;
        } else if (fields.members.contents && Array.isArray(fields.members.contents)) {
            // Handle VecSet structure if it has a contents field
            members = fields.members.contents;
        }
    }

    const parsedRoom = {
        id: objectId,
        name: fields.name || '',
        creator: fields.creator || '',
        isEncrypted: fields.is_encrypted || false,
        members: members, // Use members.length for member count
        messageCount: Number(fields.message_count || 0),
        createdAt: Number(fields.created_at || 0),
    };

    console.log('[parseChatObject] Parsed chat room:', {
        objectId: data.data?.objectId || objectId,
        name: parsedRoom.name,
        creator: parsedRoom.creator,
        isEncrypted: parsedRoom.isEncrypted,
        memberCount: parsedRoom.members.length, // Always use members.length
        messageCount: parsedRoom.messageCount,
        createdAt: parsedRoom.createdAt,
        rawFields: {
            name: fields.name,
            creator: fields.creator,
            is_encrypted: fields.is_encrypted,
            members: Array.isArray(fields.members) ? `${fields.members.length} members` : typeof fields.members,
            message_count: fields.message_count,
            created_at: fields.created_at
        }
    });

    return parsedRoom;
}

/**
 * Parse UserChatIndex object from Sui object data
 */
export function parseUserChatIndexObject(data: any): UserChatIndex | null {
    if (!data?.content || data.content.dataType !== 'moveObject') {
        return null;
    }

    const fields = data.content.fields as any;
    const chatIds = fields.chat_ids || [];
    const blocked = fields.blocked || [];

    return {
        id: data.data.objectId,
        owner: fields.owner || '',
        chatIds: Array.isArray(chatIds) ? chatIds : [],
        blocked: Array.isArray(blocked) ? blocked : [],
    };
}

/**
 * Get encrypted key for a user from a chat room
 * The encrypted key is stored as a dynamic field with the user's address as the key
 * In Move: dynamic_field::add(&mut chat_room.id, sender, encrypted_key);
 * So the key type is 'address' and value type is 'vector<u8>'
 */
export async function getEncryptedKeyFromChatRoom(
    client: any,
    chatId: string,
    userAddress: string
): Promise<Uint8Array | null> {
    try {
        // Get the dynamic field object for the user's encrypted key
        // The key is the user's address, value is vector<u8> (encrypted key)
        const dynamicFieldObject = await client.getDynamicFieldObject({
            parentId: chatId,
            name: {
                type: 'address',
                value: userAddress,
            },
        });

        if (!dynamicFieldObject.data) {
            console.warn('[getEncryptedKeyFromChatRoom] No dynamic field data found for address:', userAddress);
            return null;
        }

        // Extract the encrypted key from the dynamic field
        // The value is stored as vector<u8> which Sui serializes as an array
        const data = dynamicFieldObject.data as any;
        let encryptedKey: Uint8Array | null = null;

        // Try different paths to extract the value
        // Dynamic field value structure can vary
        if (data.content) {
            const content = data.content;
            // Check if value is directly in content
            if (content.value) {
                if (Array.isArray(content.value)) {
                    encryptedKey = new Uint8Array(content.value);
                } else if (typeof content.value === 'string') {
                    // If it's a string, try to decode it
                    try {
                        encryptedKey = new Uint8Array(
                            content.value.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
                        );
                    } catch {
                        // Try base64
                        const { fromBase64 } = await import('@/lib/crypto');
                        encryptedKey = fromBase64(content.value);
                    }
                }
            }
            // Check if value is in content.fields
            if (!encryptedKey && content.fields?.value) {
                if (Array.isArray(content.fields.value)) {
                    encryptedKey = new Uint8Array(content.fields.value);
                }
            }
        }

        // Check data.data.content structure
        if (!encryptedKey && data.data?.content) {
            const content = data.data.content;
            if (content.value && Array.isArray(content.value)) {
                encryptedKey = new Uint8Array(content.value);
            } else if (content.fields?.value && Array.isArray(content.fields.value)) {
                encryptedKey = new Uint8Array(content.fields.value);
            }
        }

        if (!encryptedKey) {
            console.warn('[getEncryptedKeyFromChatRoom] Could not extract encrypted key from dynamic field:', {
                hasData: !!data,
                hasContent: !!data?.content,
                hasDataContent: !!data?.data?.content,
                dataKeys: data ? Object.keys(data) : []
            });
        }

        return encryptedKey;
    } catch (error) {
        console.error('[getEncryptedKeyFromChatRoom] Error:', error);
        return null;
    }
}
