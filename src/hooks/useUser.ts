// Hook for user profile data and operations

import { useSuiClientQuery, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { parseProfileObject } from '@/lib/sui/profile';
import { PACKAGE_ID, MODULES } from '@/lib/types';
import type { Profile } from '@/lib/types';

const PROFILE_TYPE = `${PACKAGE_ID}::${MODULES.PROFILE}::Profile`;

/**
 * Hook to get current user's profile
 */
export function useUser() {
    const account = useCurrentAccount();

    const { data: profileObject, isLoading, error } = useSuiClientQuery(
        'getOwnedObjects',
        {
            owner: account?.address || '',
            filter: {
                StructType: PROFILE_TYPE,
            },
            options: {
                showContent: true,
                showType: true,
            },
        },
        {
            enabled: !!account?.address,
        }
    );



    // Check if profile exists (even if parsing fails)
    const hasProfileData = !!(profileObject?.data && profileObject.data.length > 0);
    const firstProfileData = profileObject?.data?.[0];

    // Try to parse the profile
    const profile: Profile | null = firstProfileData
        ? parseProfileObject(firstProfileData)
        : null;

    // If we have profile data but parsing returned null, we still consider the user registered
    // This handles cases where the profile exists but parsing might have issues
    const isRegistered = hasProfileData || !!profile;

    return {
        profile,
        isLoading,
        error,
        isRegistered,
    };
}

/**
 * Hook to get user profile by address
 */
export function useUserByAddress(address: string | null) {
    return useSuiClientQuery(
        'getOwnedObjects',
        {
            owner: address || '',
            filter: {
                StructType: PROFILE_TYPE,
            },
            options: {
                showContent: true,
                showType: true,
            },
        },
        {
            enabled: !!address,
        }
    );
}

/**
 * Hook to get parsed user profile by address
 */
export function useProfileByAddress(address: string | null) {
    const { data: profileObject, isLoading, error } = useUserByAddress(address);

    // Check if profile exists
    const hasProfileData = !!(profileObject?.data && profileObject.data.length > 0);
    const firstProfileData = profileObject?.data?.[0];

    // Try to parse the profile
    const profile: Profile | null = firstProfileData
        ? parseProfileObject(firstProfileData)
        : null;

    return {
        profile,
        isLoading,
        error,
        exists: hasProfileData || !!profile,
    };
}

/**
 * Hook to get user's UserChatIndex
 */
export function useUserChatIndex(chatIndexId: string | null) {
    return useSuiClientQuery(
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
}
