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

    const members = fields.members || [];

    const parsedRoom = {
        id: objectId,
        name: fields.name || '',
        creator: fields.creator || '',
        isEncrypted: fields.is_encrypted || false,
        members: Array.isArray(members) ? members : [],
        messageCount: Number(fields.message_count || 0),
        createdAt: Number(fields.created_at || 0),
    };

    console.log('[parseChatObject] Parsed chat room:', {
        objectId: data.data.objectId,
        name: parsedRoom.name,
        creator: parsedRoom.creator,
        isEncrypted: parsedRoom.isEncrypted,
        membersCount: parsedRoom.members.length,
        messageCount: parsedRoom.messageCount,
        createdAt: parsedRoom.createdAt,
        rawFields: {
            name: fields.name,
            creator: fields.creator,
            is_encrypted: fields.is_encrypted,
            members: Array.isArray(members) ? `${members.length} members` : 'not an array',
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
