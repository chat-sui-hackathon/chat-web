// Hook to fetch all profiles from ProfileRegistry

import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';
import { PROFILE_REGISTRY_ID, PACKAGE_ID, MODULES } from '@/lib/types';
import { parseProfileObject } from '@/lib/sui/profile';
import type { Profile } from '@/lib/types';

const PROFILE_TYPE = `${PACKAGE_ID}::${MODULES.PROFILE}::Profile`;

/**
 * Hook to get all profiles from ProfileRegistry
 * Fetches all dynamic fields from ProfileRegistry and then fetches Profile objects for each owner
 */
export function useAllProfiles() {
    const client = useSuiClient();

    return useQuery({
        queryKey: ['allProfiles'],
        queryFn: async (): Promise<Profile[]> => {
            if (!PROFILE_REGISTRY_ID) {
                throw new Error('PROFILE_REGISTRY_ID is not configured');
            }

            // Step 1: Get all dynamic fields from ProfileRegistry
            // The dynamic fields store custom_id -> owner address mappings
            const allDynamicFields: string[] = [];
            let cursor: string | null = null;
            let hasNextPage = true;

            while (hasNextPage) {
                const response = await client.getDynamicFields({
                    parentId: PROFILE_REGISTRY_ID,
                    cursor: cursor || undefined,
                });

                // Extract owner addresses from dynamic field values
                // The value is stored as an address (primitive type)
                // We need to use getDynamicFieldObject to get the actual value
                const ownerPromises = response.data.map(async (field) => {
                    try {
                        // Extract the name (custom_id) from the field
                        // For String keys, it's in field.name.value
                        let nameValue: string | undefined;
                        if (field.name && typeof field.name === 'object') {
                            if ('value' in field.name) {
                                nameValue = String(field.name.value);
                            } else if (typeof field.name === 'string') {
                                nameValue = field.name;
                            }
                        } else if (typeof field.name === 'string') {
                            nameValue = field.name;
                        }

                        if (!nameValue) {
                            console.warn('Could not extract name value from field:', field);
                            return null;
                        }

                        // First, try to get the value directly from the field object
                        // For primitive values, it might be in the field object itself
                        try {
                            const fieldObject = await client.getObject({
                                id: field.objectId,
                                options: {
                                    showContent: true,
                                },
                            });

                            // Try to extract address from field object
                            const data = fieldObject.data as any;
                            if (data?.content) {
                                const content = data.content;
                                // For address primitives, check various paths
                                if (typeof content === 'string' && content.startsWith('0x')) {
                                    return content;
                                }
                                if (content.value && typeof content.value === 'string' && content.value.startsWith('0x')) {
                                    return content.value;
                                }
                                if (content.fields?.value && typeof content.fields.value === 'string' && content.fields.value.startsWith('0x')) {
                                    return content.fields.value;
                                }
                            }
                        } catch (e) {
                            // If direct object access fails, try getDynamicFieldObject
                        }

                        // Get the dynamic field object to extract the value (owner address)
                        const dynamicFieldObject = await client.getDynamicFieldObject({
                            parentId: PROFILE_REGISTRY_ID,
                            name: {
                                type: '0x1::string::String',
                                value: nameValue,
                            },
                        });

                        // For primitive address values stored in dynamic fields
                        // The structure can vary, so we try multiple paths
                        if (dynamicFieldObject.data) {
                            const data = dynamicFieldObject.data as any;
                            
                            // Try to extract address from various possible structures
                            const tryExtractAddress = (obj: any): string | null => {
                                if (!obj) return null;
                                
                                // Direct string value
                                if (typeof obj === 'string' && obj.startsWith('0x')) {
                                    return obj;
                                }
                                
                                // Nested in value field
                                if (obj.value && typeof obj.value === 'string' && obj.value.startsWith('0x')) {
                                    return obj.value;
                                }
                                
                                // In fields.value
                                if (obj.fields?.value && typeof obj.fields.value === 'string' && obj.fields.value.startsWith('0x')) {
                                    return obj.fields.value;
                                }
                                
                                // In content.value
                                if (obj.content?.value && typeof obj.content.value === 'string' && obj.content.value.startsWith('0x')) {
                                    return obj.content.value;
                                }
                                
                                // In content.fields.value
                                if (obj.content?.fields?.value && typeof obj.content.fields.value === 'string' && obj.content.fields.value.startsWith('0x')) {
                                    return obj.content.fields.value;
                                }
                                
                                return null;
                            };
                            
                            // Try different paths
                            const address = 
                                tryExtractAddress(data) ||
                                tryExtractAddress(data.content) ||
                                tryExtractAddress(data.data) ||
                                tryExtractAddress(data.data?.content);
                            
                            if (address) {
                                return address;
                            }
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error fetching dynamic field for owner:`, error);
                        return null;
                    }
                });

                const owners = (await Promise.all(ownerPromises)).filter(
                    (owner): owner is string => owner !== null
                );

                allDynamicFields.push(...owners);

                hasNextPage = response.hasNextPage;
                cursor = response.nextCursor || null;
            }

            // Remove duplicates
            const uniqueOwners = Array.from(new Set(allDynamicFields));

            if (uniqueOwners.length === 0) {
                return [];
            }

            // Step 2: Fetch Profile objects for each owner
            // Fetch in batches to avoid overwhelming the RPC
            const batchSize = 10;
            const allProfiles: Profile[] = [];

            for (let i = 0; i < uniqueOwners.length; i += batchSize) {
                const batch = uniqueOwners.slice(i, i + batchSize);
                const profilePromises = batch.map(async (owner) => {
                    try {
                        const response = await client.getOwnedObjects({
                            owner,
                            filter: {
                                StructType: PROFILE_TYPE,
                            },
                            options: {
                                showContent: true,
                                showType: true,
                            },
                        });

                        if (response.data && response.data.length > 0) {
                            const profile = parseProfileObject(response.data[0]);
                            return profile;
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error fetching profile for owner ${owner}:`, error);
                        return null;
                    }
                });

                const profiles = (await Promise.all(profilePromises)).filter(
                    (profile): profile is Profile => profile !== null
                );

                allProfiles.push(...profiles);
            }

            // Sort by creation date (newest first)
            return allProfiles.sort((a, b) => b.createdAt - a.createdAt);
        },
        staleTime: 30000, // Cache for 30 seconds
        refetchOnWindowFocus: false,
    });
}

