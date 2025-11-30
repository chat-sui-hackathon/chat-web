// Message module contract interactions
// Messages are part of the Chat module in the new contract

import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { PACKAGE_ID, MODULES, APP_CONFIG_ID, MESSAGE_CONTENT_TYPE } from '../types';
import type { Message } from '../types';

const CHAT_MODULE = `${PACKAGE_ID}::${MODULES.CHAT}`;

/**
 * Create a transaction to send a message
 * Messages are stored as dynamic fields in the ChatRoom
 */
export function sendMessageTransaction(
    tx: Transaction,
    chatId: string,
    contentType: number, // 0: Text, 1: Image, 2: File
    content: string // Message text or blob ID
): TransactionResult {
    // Validate arguments
    console.log('[sendMessageTransaction] Arguments:', {
        appConfigId: APP_CONFIG_ID,
        chatId,
        chatIdValid: chatId && chatId.startsWith('0x') && chatId.length === 66,
        contentType,
        contentLength: content?.length,
        contentPreview: content?.substring(0, 50),
    })

    if (!APP_CONFIG_ID || !APP_CONFIG_ID.startsWith('0x')) {
        console.error('[sendMessageTransaction] Invalid APP_CONFIG_ID:', APP_CONFIG_ID)
    }
    if (!chatId || !chatId.startsWith('0x') || chatId.length !== 66) {
        console.error('[sendMessageTransaction] Invalid chatId format:', {
            chatId,
            length: chatId?.length,
            startsWithOx: chatId?.startsWith('0x'),
        })
    }

    return tx.moveCall({
        target: `${CHAT_MODULE}::send_message`,
        arguments: [
            tx.object(APP_CONFIG_ID),
            tx.object(chatId),
            tx.pure.u8(contentType),
            tx.pure.string(content),
            tx.object('0x6'), // Clock object
        ],
    });
}

/**
 * Create a transaction to send a text message
 */
export function sendTextMessageTransaction(
    tx: Transaction,
    chatId: string,
    text: string
): TransactionResult {
    return sendMessageTransaction(tx, chatId, MESSAGE_CONTENT_TYPE.TEXT, text);
}

/**
 * Create a transaction to send an image message
 */
export function sendImageMessageTransaction(
    tx: Transaction,
    chatId: string,
    imageBlobId: string // Walrus blob ID
): TransactionResult {
    return sendMessageTransaction(tx, chatId, MESSAGE_CONTENT_TYPE.IMAGE, imageBlobId);
}

/**
 * Create a transaction to send a file message
 */
export function sendFileMessageTransaction(
    tx: Transaction,
    chatId: string,
    fileBlobId: string // Walrus blob ID
): TransactionResult {
    return sendMessageTransaction(tx, chatId, MESSAGE_CONTENT_TYPE.FILE, fileBlobId);
}

/**
 * Parse Message from dynamic field data
 * Messages are stored as dynamic fields with sequence numbers as keys
 * 
 * Message struct from smart contract:
 * struct Message {
 *     sender: address,
 *     content_type: u8, // 0: Text, 1: Image, 2: File
 *     content: String,
 *     timestamp: u64,
 * }
 */
export function parseMessageObject(data: any, messageIndex: number): Message | null {
    if (!data) {
        console.warn('[parseMessageObject] No data provided');
        return null;
    }

    console.log('[parseMessageObject] Raw data structure:', {
        messageIndex,
        hasData: !!data,
        hasContent: !!data?.content,
        hasDataData: !!data?.data,
        hasDataContent: !!data?.data?.content,
        contentType: data?.content?.dataType,
        dataContentType: data?.data?.content?.dataType,
        dataKeys: Object.keys(data || {}),
        contentKeys: data?.content ? Object.keys(data.content) : [],
        dataContentKeys: data?.data?.content ? Object.keys(data.data.content) : []
    });

    // Dynamic field objects have the value in data.content
    // The Message struct is stored directly as the value
    let fields: any;

    // Handle different data structures from getDynamicFieldObject
    // getDynamicFieldObject returns: { data: { content: { dataType: 'moveObject', fields: { value: { fields: {...} } } } } }
    // The Message struct is nested in value.fields
    if (data.data?.content?.dataType === 'moveObject' && data.data.content.fields?.value?.fields) {
        // Message is in data.data.content.fields.value.fields
        fields = data.data.content.fields.value.fields;
        console.log('[parseMessageObject] Using nested moveObject structure (data.data.content.fields.value.fields), fields:', fields);
    } else if (data.content?.dataType === 'moveObject' && data.content.fields?.value?.fields) {
        // Message is in data.content.fields.value.fields
        fields = data.content.fields.value.fields;
        console.log('[parseMessageObject] Using nested moveObject structure (data.content.fields.value.fields), fields:', fields);
    } else if (data.fields?.value?.fields) {
        // Message is in fields.value.fields (direct structure)
        fields = data.fields.value.fields;
        console.log('[parseMessageObject] Using direct nested structure (fields.value.fields), fields:', fields);
    } else if (data.data?.content?.dataType === 'moveValue') {
        // Message is stored as moveValue, fields are in the value
        fields = data.data.content.value;
        console.log('[parseMessageObject] Using moveValue structure, fields:', fields);
    } else if (data.data?.content?.dataType === 'moveObject') {
        // Handle moveObject structure
        fields = data.data.content.fields;
        console.log('[parseMessageObject] Using moveObject structure, fields:', fields);
    } else if (data.content?.dataType === 'moveValue') {
        // Direct content structure
        fields = data.content.value || data.content;
        console.log('[parseMessageObject] Using direct moveValue structure, fields:', fields);
    } else if (data.content?.dataType === 'moveObject') {
        fields = data.content.fields;
        console.log('[parseMessageObject] Using direct moveObject structure, fields:', fields);
    } else if (data.fields) {
        fields = data.fields;
        console.log('[parseMessageObject] Using direct fields structure, fields:', fields);
    } else {
        console.warn('[parseMessageObject] Invalid data structure - full data:', JSON.stringify(data, null, 2));
        return null;
    }

    if (!fields) {
        console.warn('[parseMessageObject] No fields found in data');
        return null;
    }

    // Parse according to Move struct: sender, content_type, content, timestamp
    // Note: Move uses snake_case (content_type), not camelCase
    const parsedMessage = {
        sender: fields.sender || '',
        contentType: Number(fields.content_type ?? 0), // u8 -> number
        content: fields.content || '',
        timestamp: Number(fields.timestamp || 0), // u64 -> number (timestamp in ms)
        messageIndex,
    };

    // Validate required fields
    if (!parsedMessage.sender) {
        console.warn('[parseMessageObject] Missing sender field');
        return null;
    }

    console.log('[parseMessageObject] Parsed message:', {
        messageIndex,
        sender: parsedMessage.sender,
        contentType: parsedMessage.contentType,
        contentLength: parsedMessage.content.length,
        timestamp: parsedMessage.timestamp,
        timestampDate: parsedMessage.timestamp ? new Date(parsedMessage.timestamp).toISOString() : 'invalid',
        rawFields: {
            sender: fields.sender,
            content_type: fields.content_type,
            content: fields.content ? `${fields.content.substring(0, 50)}...` : 'empty',
            timestamp: fields.timestamp
        }
    });

    return parsedMessage;
}

/**
 * Helper to get message content type label
 */
export function getContentTypeLabel(contentType: number): string {
    switch (contentType) {
        case MESSAGE_CONTENT_TYPE.TEXT:
            return 'Text';
        case MESSAGE_CONTENT_TYPE.IMAGE:
            return 'Image';
        case MESSAGE_CONTENT_TYPE.FILE:
            return 'File';
        default:
            return 'Unknown';
    }
}
