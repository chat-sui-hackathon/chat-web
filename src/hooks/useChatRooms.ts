// Hook for chat rooms data and operations

import { useSuiClient, useSuiClientQuery } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { parseChatObject } from '@/lib/sui/chat';
import { PACKAGE_ID, MODULES } from '@/lib/types';
import type { ChatRoom } from '@/lib/types';

const CHAT_TYPE = `${PACKAGE_ID}::${MODULES.CHAT}::ChatRoom`;

/**
 * Hook to get all chat rooms from a user's UserChatIndex
 * This fetches chat rooms from the user's chat index
 */
export function useChatRooms(chatIndexId: string | null) {
    const client = useSuiClient();

    // First, get the UserChatIndex to get list of chat IDs
    const {
        data: chatIndexData,
        isLoading: isLoadingIndex,
        error: indexError,
        refetch: refetchIndex
    } = useSuiClientQuery(
        'getObject',
        {
            id: chatIndexId || '',
            options: {
                showContent: true,
                showType: true,
            },
        },
        {
            enabled: !!chatIndexId,
        }
    );

    // Extract chat room IDs from UserChatIndex
    const chatRoomIds: string[] = chatIndexData?.data?.content?.dataType === 'moveObject'
        ? (chatIndexData.data.content.fields as any)?.chat_ids || []
        : [];

    console.log('[useChatRooms] Chat index loaded:', {
        chatIndexId,
        hasData: !!chatIndexData,
        chatRoomIdsCount: chatRoomIds.length,
        chatRoomIds: chatRoomIds.length > 0 ? chatRoomIds : 'none'
    });

    // Fetch all chat room objects
    const {
        data: roomsData,
        isLoading: isLoadingRooms,
        error: roomsError,
        refetch: refetchRooms
    } = useQuery({
        queryKey: ['chatRooms', chatRoomIds],
        queryFn: async () => {
            if (chatRoomIds.length === 0) {
                console.log('[useChatRooms] No chat room IDs to fetch');
                return [];
            }

            console.log('[useChatRooms] Fetching chat rooms:', {
                count: chatRoomIds.length,
                ids: chatRoomIds
            });

            // Fetch all chat room objects in parallel
            const roomPromises = chatRoomIds.map((id: string) =>
                client.getObject({
                    id,
                    options: {
                        showContent: true,
                        showType: true,
                    },
                })
            );

            const results = await Promise.all(roomPromises);

            console.log('[useChatRooms] Fetched chat room objects:', {
                requested: chatRoomIds.length,
                received: results.length,
                successful: results.filter(r => r.data).length,
                failed: results.filter(r => r.error).length
            });

            return results;
        },
        enabled: chatRoomIds.length > 0,
    });

    const rooms: ChatRoom[] = roomsData
        ? roomsData
            .map((item: any) => parseChatObject(item))
            .filter(Boolean) as ChatRoom[]
        : [];

    console.log('[useChatRooms] Parsed chat rooms:', {
        rawDataCount: roomsData?.length || 0,
        parsedCount: rooms.length,
        rooms: rooms.length > 0 ? rooms.map(r => ({ id: r.id, name: r.name })) : 'none'
    });

    const refetch = async () => {
        console.log('[useChatRooms] Refetching chat rooms...');
        await refetchIndex();
        await refetchRooms();
        console.log('[useChatRooms] Refetch complete');
    };

    const error = indexError || roomsError;

    if (error) {
        console.error('[useChatRooms] Error loading chat rooms:', {
            indexError: indexError?.message,
            roomsError: roomsError?.message,
            chatIndexId,
            chatRoomIdsCount: chatRoomIds.length
        });
    }

    return {
        rooms,
        isLoading: isLoadingIndex || isLoadingRooms,
        error,
        refetch,
    };
}

/**
 * Hook to get a single chat room by ID
 */
export function useChatRoom(chatId: string | null) {
    return useSuiClientQuery(
        'getObject',
        {
            id: chatId || '',
            options: {
                showContent: true,
                showType: true,
            },
        },
        {
            enabled: !!chatId,
        }
    );
}
