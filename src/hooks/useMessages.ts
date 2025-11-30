// Hook for messages data and operations

import { useSuiClient, useSuiClientQuery } from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { parseMessageObject } from '@/lib/sui/message';
import { getGrpcClient } from '@/lib/sui/grpc-client';
import { MESSAGES_PER_PAGE, MAX_MESSAGES_DISPLAY, PACKAGE_ID, MODULES } from '@/lib/types';
import type { Message } from '@/lib/types';

/**
 * Hook to get messages for a chat room
 * Messages are stored as dynamic fields with sequence numbers (u64) as keys
 */
export function useMessages(chatId: string | null) {
    const client = useSuiClient();
    const queryClient = useQueryClient();
    const subscriptionRef = useRef<(() => void) | null>(null);
    const lastMessageCountRef = useRef<number>(0);
    const lastMismatchCheckRef = useRef<{ messageCount: number; messagesCount: number; lastMessageIndex: number } | null>(null);

    // Helper function to invalidate all chat object queries (regardless of options)
    const invalidateChatObjectQueries = () => {
        if (!chatId) return
        // Use predicate to match queries with different option structures
        // This ensures both useMessages and useChatRoom queries are invalidated
        queryClient.invalidateQueries({ 
            predicate: (query) => {
                const key = query.queryKey
                if (!Array.isArray(key) || key.length < 3) return false
                // Match queries like ['sui-client', 'getObject', chatId] or ['sui-client', 'getObject', { id: chatId, ... }]
                return key[0] === 'sui-client' && 
                       key[1] === 'getObject' && 
                       (key[2] === chatId || (typeof key[2] === 'object' && key[2]?.id === chatId))
            }
        })
    }

    // Helper function to fetch and append only missing messages (instead of refetching everything)
    const fetchAndAppendMissingMessages = async (fromIndex: number, toIndex: number) => {
        if (!chatId || fromIndex > toIndex) return

        try {
            const missingIndices: number[] = []
            for (let i = fromIndex; i <= toIndex; i++) {
                missingIndices.push(i)
            }

            if (missingIndices.length === 0) return

            console.log('[useMessages] Fetching and appending missing messages:', {
                chatId,
                missingIndices,
                count: missingIndices.length
            })

            // Fetch only the missing messages
            const messagePromises = missingIndices.map((index: number) =>
                client.getDynamicFieldObject({
                    parentId: chatId,
                    name: {
                        type: 'u64',
                        value: index.toString(),
                    },
                })
            )

            const results = await Promise.all(messagePromises)
            const newMessages = results
                .map((result, idx) => {
                    if (result.data) {
                        return parseMessageObject(result.data, missingIndices[idx])
                    }
                    return null
                })
                .filter(Boolean) as Message[]

            if (newMessages.length > 0) {
                // Find and update all message queries for this chat
                // This ensures we update the cache regardless of the exact query key structure
                queryClient.setQueriesData<Message[]>(
                    { queryKey: ['messages', chatId] },
                    (oldMessages = []) => {
                        // Combine old and new, remove duplicates, sort, and keep last N
                        const combined = [...oldMessages, ...newMessages]
                        // Remove duplicates by messageIndex
                        const unique = combined.filter((msg, idx, arr) => 
                            arr.findIndex(m => m.messageIndex === msg.messageIndex) === idx
                        )
                        unique.sort((a, b) => a.messageIndex - b.messageIndex)
                        return unique.slice(-MAX_MESSAGES_DISPLAY)
                    }
                )
                console.log('[useMessages] Successfully appended new messages:', {
                    chatId,
                    appendedCount: newMessages.length
                })
            }
        } catch (error) {
            console.error('[useMessages] Error fetching missing messages:', {
                chatId,
                fromIndex,
                toIndex,
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }

    // Get chat room to get message count
    const { data: chatData, refetch: refetchChatRoom } = useSuiClientQuery(
        'getObject',
        {
            id: chatId || '',
            options: {
                showContent: true,
            },
        },
        {
            enabled: !!chatId,
        }
    );

    const messageCount =
        chatData?.data?.content?.dataType === 'moveObject'
            ? Number((chatData.data.content.fields as any)?.message_count || 0)
            : 0;

    // Initialize and update last known message count
    useEffect(() => {
        if (chatId && messageCount > 0) {
            // Initialize on first load or when chatId changes
            if (lastMessageCountRef.current === 0 || lastMessageCountRef.current < messageCount) {
                console.log('[useMessages] Initializing/updating message count:', {
                    chatId,
                    oldCount: lastMessageCountRef.current,
                    newCount: messageCount
                });
                lastMessageCountRef.current = messageCount;
            }
        } else if (!chatId) {
            // Reset when chatId is cleared
            lastMessageCountRef.current = 0;
        }
    }, [chatId, messageCount]);

    console.log('[useMessages] Chat room loaded:', {
        chatId,
        hasChatData: !!chatData,
        messageCount,
        chatDataStructure: chatData?.data?.content?.dataType
    });

    // Fetch messages using dynamic fields
    // Messages are stored with u64 sequence numbers as keys
    const { data: dynamicFields, isLoading, error, refetch } = useSuiClientQuery(
        'getDynamicFields',
        {
            parentId: chatId || '',
        },
        {
            enabled: !!chatId,
        }
    );

    console.log('[useMessages] Dynamic fields loaded:', {
        chatId,
        hasDynamicFields: !!dynamicFields,
        dynamicFieldsCount: dynamicFields?.data?.length || 0,
        isLoading,
        error: error?.message
    });

    // Extract message indices from dynamic fields
    // Dynamic fields with u64 keys are the messages
    const messageIndices: number[] = [];
    if (dynamicFields?.data) {
        dynamicFields.data.forEach((field: any) => {
            const name = field.name;
            // Check if this is a u64 key (message index)
            // The name can be in different formats depending on SDK version
            if (name) {
                let index: number | null = null;

                if (typeof name === 'number') {
                    index = name;
                } else if (name.type === 'u64' || name.type === '0x1::string::String') {
                    // Handle different name formats
                    if (typeof name.value === 'number') {
                        index = name.value;
                    } else if (typeof name.value === 'string') {
                        const parsed = parseInt(name.value, 10);
                        if (!isNaN(parsed)) {
                            index = parsed;
                        }
                    }
                } else if (typeof name.value === 'number') {
                    index = name.value;
                }

                if (index !== null && index >= 0 && index < messageCount) {
                    messageIndices.push(index);
                }
            }
        });
    }

    console.log('[useMessages] Extracted message indices:', {
        chatId,
        totalIndices: messageIndices.length,
        indices: messageIndices.length > 0 ? messageIndices.slice(0, 10) : 'none', // Log first 10
        messageCount,
        validIndices: messageIndices.filter(idx => idx >= 0 && idx < messageCount).length
    });

    // Sort indices ascending (oldest first) so latest messages appear at bottom
    messageIndices.sort((a, b) => a - b);
    // Take the last N messages (most recent ones) but keep them in ascending order
    const indicesToFetch = messageIndices.slice(-MAX_MESSAGES_DISPLAY);

    console.log('[useMessages] Indices to fetch:', {
        chatId,
        totalIndices: messageIndices.length,
        indicesToFetch: indicesToFetch.length,
        indices: indicesToFetch.length > 0 ? indicesToFetch : 'none',
        maxDisplay: MAX_MESSAGES_DISPLAY
    });

    // Fetch message objects
    // Use stable query key (only chatId) to avoid re-renders when indices change
    const {
        data: messagesData,
        isLoading: isLoadingMessages,
        error: messagesError,
    } = useQuery({
        queryKey: ['messages', chatId],
        queryFn: async () => {
            // Recalculate indicesToFetch inside queryFn to get latest indices
            const currentDynamicFields = await client.getDynamicFields({
                parentId: chatId!,
            });

            const currentMessageIndices: number[] = [];
            if (currentDynamicFields?.data) {
                currentDynamicFields.data.forEach((field: any) => {
                    const name = field.name;
                    if (name) {
                        let index: number | null = null;

                        if (typeof name === 'number') {
                            index = name;
                        } else if (name.type === 'u64' || name.type === '0x1::string::String') {
                            if (typeof name.value === 'number') {
                                index = name.value;
                            } else if (typeof name.value === 'string') {
                                const parsed = parseInt(name.value, 10);
                                if (!isNaN(parsed)) {
                                    index = parsed;
                                }
                            }
                        } else if (typeof name.value === 'number') {
                            index = name.value;
                        }

                        if (index !== null && index >= 0 && index < messageCount) {
                            currentMessageIndices.push(index);
                        }
                    }
                });
            }

            currentMessageIndices.sort((a, b) => a - b);
            const currentIndicesToFetch = currentMessageIndices.slice(-MAX_MESSAGES_DISPLAY);

            if (currentIndicesToFetch.length === 0) {
                console.log('[useMessages] No indices to fetch');
                return [];
            }

            console.log('[useMessages] Fetching message objects:', {
                chatId,
                count: currentIndicesToFetch.length,
                indices: currentIndicesToFetch
            });

            // Fetch dynamic field objects
            // Note: We need to use getDynamicFieldObject for each message
            const messagePromises = currentIndicesToFetch.map((index: number) =>
                client.getDynamicFieldObject({
                    parentId: chatId!,
                    name: {
                        type: 'u64',
                        value: index.toString(), // Convert to string for U64 type
                    },
                })
            );

            const results = await Promise.all(messagePromises);

            // Log first successful result structure for debugging
            const firstSuccess = results.find(r => r.data);
            if (firstSuccess?.data) {
                const data = firstSuccess.data as any;
                console.log('[useMessages] First successful result structure:', {
                    chatId,
                    index: currentIndicesToFetch[results.indexOf(firstSuccess)],
                    dataKeys: Object.keys(data),
                    hasContent: !!data.content,
                    hasData: !!data.data,
                    contentType: data.content?.dataType,
                    dataContentType: data.data?.content?.dataType,
                    contentValue: data.content?.value ? Object.keys(data.content.value) : 'no value',
                    fullStructure: JSON.stringify(data, null, 2).substring(0, 500)
                });
            }

            console.log('[useMessages] Fetched message objects:', {
                chatId,
                requested: indicesToFetch.length,
                received: results.length,
                successful: results.filter(r => r.data).length,
                failed: results.filter(r => r.error).length,
                errors: results.filter(r => r.error).map(r => {
                    if (r.error && typeof r.error === 'object' && 'message' in r.error) {
                        return (r.error as any).message;
                    }
                    return String(r.error);
                })
            });

            const parsedMessages = results
                .map((result, idx) => {
                    if (result.data) {
                        return parseMessageObject(result.data, currentIndicesToFetch[idx]);
                    }
                    return null;
                })
                .filter(Boolean) as Message[];

            // Sort messages by index ascending (oldest first, latest at bottom)
            parsedMessages.sort((a, b) => a.messageIndex - b.messageIndex);

            console.log('[useMessages] Parsed messages:', {
                chatId,
                rawDataCount: results.filter(r => r.data).length,
                parsedCount: parsedMessages.length,
                messages: parsedMessages.length > 0
                    ? parsedMessages.map(m => ({
                        index: m.messageIndex,
                        sender: m.sender.slice(0, 8) + '...',
                        contentType: m.contentType,
                        contentLength: m.content.length
                    }))
                    : 'none'
            });

            return parsedMessages;
        },
        enabled: !!chatId && messageCount > 0,
    });

    // Ensure messages are sorted ascending (oldest first, latest at bottom)
    const messages: Message[] = messagesData
        ? [...messagesData].sort((a, b) => a.messageIndex - b.messageIndex)
        : [];

    const finalError = error || messagesError;

    if (finalError) {
        console.error('[useMessages] Error loading messages:', {
            chatId,
            dynamicFieldsError: error?.message,
            messagesError: messagesError?.message,
            messageCount,
            messagesCount: messages.length
        });
    }

    // Monitor for missing messages by comparing last message index with message count
    // Trigger refetch if the last message index is less than (messageCount - 1)
    useEffect(() => {
        if (!chatId || isLoading || isLoadingMessages) {
            return
        }

        // Find the last (highest) message index in the loaded messages
        // Messages are sorted ascending, so the last one has the highest index
        const lastMessageIndex = messages.length > 0 
            ? messages[messages.length - 1].messageIndex 
            : -1

        // Message indices are 0-based, so the last message should be at index (messageCount - 1)
        // If lastMessageIndex < (messageCount - 1), we're missing newer messages
        // Also check if we have no messages but messageCount > 0
        const expectedLastIndex = messageCount - 1
        const hasMissingMessages = messageCount > 0 && (
            messages.length === 0 || 
            lastMessageIndex < expectedLastIndex
        )

        if (hasMissingMessages) {
            // Check if we've already handled this exact mismatch to avoid infinite loops
            const lastCheck = lastMismatchCheckRef.current
            const isSameMismatch = lastCheck && 
                lastCheck.messageCount === messageCount && 
                lastCheck.lastMessageIndex === lastMessageIndex

            if (!isSameMismatch) {
                const missingCount = expectedLastIndex - lastMessageIndex
                console.log('[useMessages] Missing messages detected (last index < message count), triggering refetch:', {
                    chatId,
                    messageCount,
                    lastMessageIndex,
                    expectedLastIndex,
                    missingCount,
                    messagesCount: messages.length
                })

                // Update the ref to track this mismatch check
                lastMismatchCheckRef.current = { 
                    messageCount, 
                    messagesCount: messages.length,
                    lastMessageIndex 
                }

                // Invalidate and refetch chat room query to refresh message count
                invalidateChatObjectQueries()
                refetchChatRoom().catch((error) => {
                    console.warn('[useMessages] Error refetching chat room:', {
                        chatId,
                        error: error instanceof Error ? error.message : String(error)
                    })
                })

                // Fetch only missing messages and append them (instead of refetching everything)
                fetchAndAppendMissingMessages(lastMessageIndex + 1, expectedLastIndex).catch((error) => {
                    console.error('[useMessages] Error appending missing messages, falling back to refetch:', {
                        chatId,
                        error: error instanceof Error ? error.message : String(error)
                    })
                    // Fallback to full refetch on error
                    refetch().catch((refetchError) => {
                        console.error('[useMessages] Error in fallback refetch:', {
                            chatId,
                            error: refetchError instanceof Error ? refetchError.message : String(refetchError)
                        })
                    })
                })
            }
        } else if (
            (messageCount === 0 && messages.length === 0) ||
            (messageCount > 0 && messages.length > 0 && lastMessageIndex === expectedLastIndex)
        ) {
            // Reset mismatch check when we have all messages (or no messages expected)
            lastMismatchCheckRef.current = null
        }
    }, [chatId, messageCount, messages, isLoading, isLoadingMessages, refetch, refetchChatRoom, queryClient])

    // Subscribe to MessageSent events for real-time updates using gRPC
    useEffect(() => {
        if (!chatId) {
            console.log('[useMessages] Skipping event subscription: no chatId');
            return;
        }

        console.log('[useMessages] ===== gRPC Event Subscription Setup =====');
        console.log('[useMessages] Setting up gRPC-based event monitoring:', {
            chatId,
            packageId: PACKAGE_ID,
            module: MODULES.CHAT,
            currentMessageCount: messageCount,
            timestamp: new Date().toISOString()
        });

        let unsubscribeFn: (() => void) | null = null;
        let checkpointStream: any = null;

        const eventType = `${PACKAGE_ID}::${MODULES.CHAT}::MessageSent`;
        console.log('[useMessages] Event type to monitor:', eventType);

        try {
            const grpcClient = getGrpcClient();
            console.log('[useMessages] gRPC client obtained:', {
                hasGrpcClient: !!grpcClient,
                clientType: grpcClient?.constructor?.name
            });

            // Subscribe to checkpoints via gRPC
            // When new checkpoints arrive, we'll query for events
            console.log('[useMessages] Subscribing to checkpoints via gRPC...');

            checkpointStream = grpcClient.subscriptionService.subscribeCheckpoints({});

            console.log('[useMessages] Checkpoint stream created:', {
                hasStream: !!checkpointStream,
                streamType: checkpointStream?.constructor?.name
            });

            // Handle checkpoint responses
            checkpointStream.responses.onMessage(async (response: any) => {
                console.log('[useMessages] Received checkpoint via gRPC:', {
                    chatId,
                    checkpointSequence: response.cursor?.toString(),
                    hasCheckpoint: !!response.checkpoint
                });

                // When a checkpoint is received, query for MessageSent events
                // This is more efficient than polling all the time
                if (response.checkpoint) {
                    try {
                        const eventType = `${PACKAGE_ID}::${MODULES.CHAT}::MessageSent`;

                        // Query events for this checkpoint's transactions
                        // Checkpoint has transactions array with ExecutedTransaction objects
                        const checkpoint = response.checkpoint;
                        const executedTransactions = checkpoint.transactions || [];

                        console.log('[useMessages] Checkpoint structure:', {
                            chatId,
                            checkpointSequence: response.cursor?.toString(),
                            hasTransactions: !!checkpoint.transactions,
                            transactionCount: executedTransactions.length,
                            checkpointKeys: checkpoint ? Object.keys(checkpoint) : []
                        });

                        // Query events for MessageSent type
                        // ExecutedTransaction objects have transaction digest and events
                        if (executedTransactions.length > 0) {
                            // Check the last few transactions (most recent ones)
                            const recentTransactions = executedTransactions.slice(-10); // Check last 10 transactions

                            for (const executedTx of recentTransactions) {
                                try {
                                    // ExecutedTransaction has transaction and events
                                    const txDigest = executedTx.transaction?.digest ||
                                        (executedTx as any).digest ||
                                        String(executedTx);

                                    // Check if events are already in the executed transaction
                                    const txEvents = executedTx.events?.events ||
                                        (executedTx as any).events ||
                                        null;

                                    let messageEvents: any[] = [];

                                    if (txEvents && Array.isArray(txEvents)) {
                                        // Events are already in the executed transaction
                                        const eventType = `${PACKAGE_ID}::${MODULES.CHAT}::MessageSent`;
                                        messageEvents = txEvents.filter((event: any) =>
                                            event.type === eventType || event.eventType === eventType
                                        );
                                    } else {
                                        // Need to fetch transaction to get events
                                        const txResponse = await client.getTransactionBlock({
                                            digest: typeof txDigest === 'string' ? txDigest : String(txDigest),
                                            options: {
                                                showEvents: true,
                                            },
                                        });

                                        if (txResponse.events && txResponse.events.length > 0) {
                                            const eventType = `${PACKAGE_ID}::${MODULES.CHAT}::MessageSent`;
                                            messageEvents = txResponse.events.filter((event: any) =>
                                                event.type === eventType
                                            );
                                        }
                                    }

                                    // Process MessageSent events if found
                                    if (messageEvents.length > 0) {
                                        console.log('[useMessages] Found MessageSent events in checkpoint:', {
                                            chatId,
                                            checkpointSequence: response.cursor?.toString(),
                                            eventCount: messageEvents.length
                                        });

                                        let hasNewMessages = false

                                        // Process each MessageSent event
                                        for (const event of messageEvents) {
                                            const parsedJson = event.parsedJson as any;
                                            if (parsedJson) {
                                                const eventChatId = parsedJson.chat_id;
                                                const messageIndex = Number(parsedJson.message_index);

                                                // Only process events for the current chat room
                                                if (eventChatId === chatId) {
                                                    console.log('[useMessages] Processing MessageSent event from checkpoint:', {
                                                        chatId: eventChatId,
                                                        messageIndex,
                                                        sender: parsedJson.sender
                                                    });

                                                    // Check if message already exists (deduplication)
                                                    const existingMessages = queryClient.getQueryData<Message[]>(['messages', chatId]) || [];
                                                    const messageExists = existingMessages.some(m => m.messageIndex === messageIndex);

                                                    if (!messageExists) {
                                                        hasNewMessages = true

                                                        // Fetch the new message
                                                        const result = await client.getDynamicFieldObject({
                                                            parentId: chatId,
                                                            name: {
                                                                type: 'u64',
                                                                value: messageIndex.toString(),
                                                            },
                                                        });

                                                        if (result.data) {
                                                            const newMessage = parseMessageObject(result.data, messageIndex);
                                                            if (newMessage) {
                                                                // Update the query cache with the new message (append only)
                                                                queryClient.setQueriesData<Message[]>(
                                                                    { queryKey: ['messages', chatId] },
                                                                    (oldMessages = []) => {
                                                                        const exists = oldMessages.some(m => m.messageIndex === messageIndex);
                                                                        if (exists) return oldMessages;

                                                                        // Add new message and keep ascending order (oldest first)
                                                                        const updated = [...oldMessages, newMessage];
                                                                        updated.sort((a, b) => a.messageIndex - b.messageIndex);
                                                                        // Keep only the last N messages (most recent)
                                                                        return updated.slice(-MAX_MESSAGES_DISPLAY);
                                                                    }
                                                                );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // Trigger refetch when new messages are detected
                                        if (hasNewMessages) {
                                            console.log('[useMessages] New messages detected via gRPC, triggering refetch:', { chatId })
                                            
                                            // Update message count ref and invalidate chat room query
                                            const currentChatData = await client.getObject({
                                                id: chatId,
                                                options: {
                                                    showContent: true,
                                                },
                                            })
                                            
                                            const currentMessageCount = currentChatData?.data?.content?.dataType === 'moveObject'
                                                ? Number((currentChatData.data.content.fields as any)?.message_count || 0)
                                                : 0
                                            
                                            if (currentMessageCount > lastMessageCountRef.current) {
                                                lastMessageCountRef.current = currentMessageCount
                                            }

                                            // Invalidate and refetch chat room query to update message count
                                            invalidateChatObjectQueries()
                                            await refetchChatRoom().catch((error) => {
                                                console.warn('[useMessages] Error refetching chat room:', {
                                                    chatId,
                                                    error: error instanceof Error ? error.message : String(error)
                                                })
                                            })

                                            // Messages are already appended to cache above, no need to refetch
                                        }
                                    }
                                } catch (txError) {
                                    // Skip individual transaction errors
                                    console.warn('[useMessages] Error processing transaction from checkpoint:', {
                                        chatId,
                                        transaction: executedTx,
                                        error: txError instanceof Error ? txError.message : String(txError)
                                    });
                                }
                            }
                        } else {
                            // Fallback: just trigger a refetch if we can't get transaction digests
                            console.log('[useMessages] Checkpoint received, triggering refetch:', { chatId });
                            
                            // Invalidate and refetch chat room query to refresh message count
                            invalidateChatObjectQueries()
                            await refetchChatRoom().catch((error) => {
                                console.warn('[useMessages] Error refetching chat room:', {
                                    chatId,
                                    error: error instanceof Error ? error.message : String(error)
                                })
                            })
                            
                            // Try to append missing messages instead of full refetch
                            const currentMessages = queryClient.getQueryData<Message[]>(['messages', chatId]) || []
                            const currentLastIndex = currentMessages.length > 0 
                                ? currentMessages[currentMessages.length - 1].messageIndex 
                                : -1
                            // Get message count from chat room
                            const chatData = await client.getObject({
                                id: chatId,
                                options: { showContent: true },
                            })
                            const msgCount = chatData?.data?.content?.dataType === 'moveObject'
                                ? Number((chatData.data.content.fields as any)?.message_count || 0)
                                : 0
                            const expectedLastIndex = msgCount - 1
                            if (currentLastIndex < expectedLastIndex) {
                                await fetchAndAppendMissingMessages(currentLastIndex + 1, expectedLastIndex).catch(() => {
                                    refetch() // Fallback
                                })
                            }
                        }
                    } catch (error) {
                        console.error('[useMessages] Error processing checkpoint:', {
                            chatId,
                            error: error instanceof Error ? error.message : String(error)
                        });
                        
                        // Invalidate and refetch chat room query to refresh message count
                        invalidateChatObjectQueries()
                        await refetchChatRoom().catch((error) => {
                            console.warn('[useMessages] Error refetching chat room:', {
                                chatId,
                                error: error instanceof Error ? error.message : String(error)
                            })
                        })
                        
                        // Fallback: try to append missing messages instead of full refetch
                        const currentMessages = queryClient.getQueryData<Message[]>(['messages', chatId]) || []
                        const currentLastIndex = currentMessages.length > 0 
                            ? currentMessages[currentMessages.length - 1].messageIndex 
                            : -1
                        const expectedLastIndex = messageCount - 1
                        if (currentLastIndex < expectedLastIndex) {
                            await fetchAndAppendMissingMessages(currentLastIndex + 1, expectedLastIndex).catch(() => {
                                // Fallback to refetch only if append fails
                                refetch()
                            })
                        }
                    }
                }
            });

            checkpointStream.responses.onError((error: any) => {
                console.error('[useMessages] gRPC checkpoint stream error:', {
                    chatId,
                    error,
                    errorMessage: error?.message || String(error),
                    errorName: error?.name,
                    // QUIC errors are common and can be recovered from
                    isQuicError: error?.message?.includes('QUIC') || String(error).includes('QUIC')
                });

                // QUIC errors are often transient - the stream may recover
                // We'll rely on polling as fallback
            });

            checkpointStream.responses.onComplete(() => {
                console.log('[useMessages] gRPC checkpoint stream completed:', { chatId });
            });

            unsubscribeFn = () => {
                console.log('[useMessages] Closing gRPC checkpoint stream:', { chatId });
                if (checkpointStream) {
                    try {
                        // Check if cancel method exists before calling
                        if (typeof checkpointStream.cancel === 'function') {
                            checkpointStream.cancel();
                            console.log('[useMessages] Successfully cancelled gRPC stream:', { chatId });
                        } else if (typeof checkpointStream.close === 'function') {
                            checkpointStream.close();
                            console.log('[useMessages] Successfully closed gRPC stream:', { chatId });
                        } else {
                            console.warn('[useMessages] No cancel/close method found on checkpoint stream:', {
                                chatId,
                                streamMethods: Object.keys(checkpointStream).filter(k => typeof checkpointStream[k] === 'function')
                            });
                        }
                    } catch (cancelError) {
                        console.warn('[useMessages] Error cancelling gRPC stream (non-fatal):', {
                            chatId,
                            error: cancelError instanceof Error ? cancelError.message : String(cancelError)
                        });
                    }
                }
            };

            console.log('[useMessages] ✅ gRPC checkpoint subscription established');

        } catch (error) {
            console.error('[useMessages] ❌ Error setting up gRPC subscription:', {
                chatId,
                error,
                errorMessage: error instanceof Error ? error.message : String(error)
            });
        }

        // Fallback: Poll for new messages based on message count changes
        // Only refetch if message count has increased
        const pollInterval = setInterval(async () => {
            try {
                // Get current message count from chat room
                const currentChatData = await client.getObject({
                    id: chatId,
                    options: {
                        showContent: true,
                    },
                });

                const currentMessageCount = currentChatData?.data?.content?.dataType === 'moveObject'
                    ? Number((currentChatData.data.content.fields as any)?.message_count || 0)
                    : 0;

                const lastKnownCount = lastMessageCountRef.current;

                console.log('[useMessages] Polling check:', {
                    chatId,
                    lastKnownCount,
                    currentMessageCount,
                    hasNewMessages: currentMessageCount > lastKnownCount,
                    newMessageCount: currentMessageCount - lastKnownCount
                });

                // Refetch if message count has increased
                // The mismatch check is handled by the separate useEffect above
                if (currentMessageCount > lastKnownCount) {
                    console.log('[useMessages] Message count increased, fetching new messages:', {
                        chatId,
                        lastKnownCount,
                        currentMessageCount,
                        newMessages: currentMessageCount - lastKnownCount
                    });

                    // Update the ref before refetching
                    lastMessageCountRef.current = currentMessageCount;

                    // Invalidate and refetch chat room query to refresh message count
                    invalidateChatObjectQueries()
                    await refetchChatRoom().catch((error) => {
                        console.warn('[useMessages] Error refetching chat room:', {
                            chatId,
                            error: error instanceof Error ? error.message : String(error)
                        })
                    })

                    // Append missing messages instead of full refetch
                    const currentMessages = queryClient.getQueryData<Message[]>(['messages', chatId]) || []
                    const currentLastIndex = currentMessages.length > 0 
                        ? currentMessages[currentMessages.length - 1].messageIndex 
                        : -1
                    const expectedLastIndex = currentMessageCount - 1
                    if (currentLastIndex < expectedLastIndex) {
                        await fetchAndAppendMissingMessages(currentLastIndex + 1, expectedLastIndex).catch(() => {
                            refetch() // Fallback
                        })
                    }
                } else {
                    console.log('[useMessages] No new messages, skipping refetch:', {
                        chatId,
                        messageCount: currentMessageCount
                    });
                }
            } catch (error) {
                console.error('[useMessages] Error polling for messages:', {
                    chatId,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }, 5000);

        return () => {
            console.log('[useMessages] Cleanup: Stopping gRPC subscription and polling:', { chatId });
            clearInterval(pollInterval);
            if (unsubscribeFn) {
                try {
                    unsubscribeFn();
                } catch (error) {
                    console.error('[useMessages] Error unsubscribing from gRPC:', error);
                }
            }
            subscriptionRef.current = null;
        };
    }, [chatId, client, queryClient, refetch, refetchChatRoom]);

    console.log('[useMessages] Final messages state:', {
        chatId,
        messageCount,
        messagesCount: messages.length,
        isLoading: isLoading || isLoadingMessages,
        hasMore: messageCount > messages.length,
        error: finalError?.message
    });

    return {
        messages,
        messageCount,
        isLoading: isLoading || isLoadingMessages,
        error: finalError,
        refetch,
        hasMore: messageCount > messages.length,
    };
}

/**
 * Hook to get a single message by index
 */
export function useMessage(chatId: string | null, messageIndex: number | null) {
    const client = useSuiClient();

    return useQuery({
        queryKey: ['message', chatId, messageIndex],
        queryFn: async () => {
            if (!chatId || messageIndex === null) return null;

            const result = await client.getDynamicFieldObject({
                parentId: chatId,
                name: {
                    type: 'u64',
                    value: messageIndex.toString(), // Convert to string for U64 type
                },
            });

            if (result.data) {
                return parseMessageObject(result.data, messageIndex);
            }
            return null;
        },
        enabled: !!chatId && messageIndex !== null,
    });
}
