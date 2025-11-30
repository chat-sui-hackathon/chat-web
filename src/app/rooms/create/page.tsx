'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import toast from 'react-hot-toast'
import { Header } from '@/components/common/Header'
import { createChatTransaction } from '@/lib/sui/chat'
import { useUser } from '@/hooks/useUser'
import { useSponsoredTransaction } from '@/hooks'
import { createRandomSymmetricKey, encryptWithPublicKey, initCrypto, fromBase64 } from '@/lib/crypto'
import { createTransactionLogger } from '@/lib/sui/transaction-logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, MessageSquare, Lock, Globe } from 'lucide-react'

export default function CreateRoomPage() {
    const router = useRouter()
    const account = useCurrentAccount()
    const { profile, isLoading: isLoadingProfile, isRegistered } = useUser()
    const { execute: executeSponsoredTx, isPending } = useSponsoredTransaction()
    const client = useSuiClient()

    const [roomName, setRoomName] = useState('')
    const [isEncrypted, setIsEncrypted] = useState(false)
    const [isCreating, setIsCreating] = useState(false)

    // Redirect if not registered
    useEffect(() => {
        if (account && !isLoadingProfile && !isRegistered) {
            router.push('/register')
        }
    }, [account, isLoadingProfile, isRegistered, router])

    const handleCreateRoom = async () => {
        console.log('[CreateRoomPage] === Starting room creation ===')
        console.log('[CreateRoomPage] Account:', account?.address)
        console.log('[CreateRoomPage] Profile chatIndexId:', profile?.chatIndexId)
        console.log('[CreateRoomPage] Room name:', roomName.trim())
        console.log('[CreateRoomPage] Is encrypted:', isEncrypted)

        if (!account) {
            console.error('[CreateRoomPage] Error: No account')
            toast.error('Please sign in first')
            return
        }

        if (!profile?.chatIndexId) {
            console.error('[CreateRoomPage] Error: Profile not found')
            toast.error('Profile not found. Please register first.')
            return
        }

        if (!roomName.trim()) {
            console.error('[CreateRoomPage] Error: Room name is required')
            toast.error('Room name is required')
            return
        }

        setIsCreating(true)

        try {
            // Initialize crypto library
            console.log('[CreateRoomPage] Step 1: Initializing crypto...')
            await initCrypto()

            const tx = new Transaction()

            // For encrypted rooms, generate a symmetric key and encrypt it with user's public key
            // For public rooms, use empty array
            let encryptedKey: Uint8Array | string = new Uint8Array(0)

            if (isEncrypted) {
                if (!profile?.publicKey) {
                    toast.error('Public key not found in profile. Please update your profile.')
                    setIsCreating(false)
                    return
                }

                // Generate a random symmetric key for the room
                console.log('[CreateRoomPage] Step 1: Generating room encryption key...')
                const symmetricKey = createRandomSymmetricKey()

                // Convert profile public key to Uint8Array
                // The public key from Sui is stored as vector<u8> which may come as array of numbers
                let publicKey: Uint8Array
                if (typeof profile.publicKey === 'string') {
                    // If it's a string, try to decode it
                    // Could be base64 or hex encoded
                    try {
                        // Try base64 first using crypto utility
                        publicKey = fromBase64(profile.publicKey)
                    } catch {
                        try {
                            // Try hex
                            publicKey = new Uint8Array(
                                profile.publicKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
                            )
                        } catch {
                            // Fallback: treat as raw string
                            publicKey = new TextEncoder().encode(profile.publicKey)
                        }
                    }
                } else if (Array.isArray(profile.publicKey)) {
                    // If it's an array of numbers, convert to Uint8Array
                    publicKey = new Uint8Array(profile.publicKey)
                } else {
                    // Already Uint8Array
                    publicKey = profile.publicKey
                }

                // Validate public key length (X25519 public keys are 32 bytes)
                if (publicKey.length !== 32) {
                    console.error('[CreateRoomPage] Invalid public key length:', publicKey.length)
                    toast.error(`Invalid public key length: ${publicKey.length} bytes. Expected 32 bytes.`)
                    setIsCreating(false)
                    return
                }

                // Encrypt the symmetric key with the user's public key
                encryptedKey = encryptWithPublicKey(symmetricKey, publicKey)
                console.log('[CreateRoomPage] Step 1: Room key generated and encrypted')
            }

            const txParams = {
                userIndexId: profile.chatIndexId,
                name: roomName.trim(),
                isEncrypted,
                encryptedKey,
            }
            console.log('[CreateRoomPage] Step 1: Transaction params:', {
                ...txParams,
                encryptedKey: encryptedKey instanceof Uint8Array ? `[${encryptedKey.length} bytes]` : encryptedKey,
            })

            createChatTransaction(tx, txParams)
            console.log('[CreateRoomPage] Step 1: Transaction created')

            // Log transaction start
            const logger = createTransactionLogger('createChat')
            logger.logStart(txParams, tx)

            // Execute via sponsored transaction
            console.log('[CreateRoomPage] Step 2: Executing sponsored transaction...')
            const result = await executeSponsoredTx(tx)
            console.log('[CreateRoomPage] Step 2: Transaction result:', {
                success: result.success,
                digest: result.digest,
                error: result.error,
            })

            if (result.success && result.digest) {
                logger.logSuccess(result)
                console.log('[CreateRoomPage] === Room created successfully! ===')
                toast.success('Chat room created successfully!')

                // Extract chat room ID from transaction effects
                let chatRoomId: string | undefined

                try {
                    // Fetch the full transaction response to get structured effects
                    console.log('[CreateRoomPage] Step 3: Fetching transaction details...')
                    const txResponse = await client.getTransactionBlock({
                        digest: result.digest,
                        options: {
                            showEffects: true,
                            showObjectChanges: true,
                        },
                    })
                    console.log('[CreateRoomPage] Step 3: Transaction response:', {
                        hasEffects: !!txResponse.effects,
                        sharedObjectsCount: (txResponse.effects as any)?.sharedObjects?.length || 0,
                        createdCount: (txResponse.effects as any)?.created?.length || 0,
                        objectChangesCount: txResponse.objectChanges?.length || 0,
                    })

                    // Check shared objects (ChatRoom is shared)
                    if (txResponse.effects && typeof txResponse.effects !== 'string') {
                        if (txResponse.effects.sharedObjects && txResponse.effects.sharedObjects.length > 0) {
                            console.log('[CreateRoomPage] Step 3: Checking shared objects...')
                            // Find the ChatRoom object (should be the one we just created)
                            const chatRoom = txResponse.effects.sharedObjects.find(
                                (obj: any) => obj.objectType?.includes('ChatRoom') || obj.objectType?.includes('chat::ChatRoom')
                            )
                            if (chatRoom) {
                                chatRoomId = chatRoom.objectId
                                console.log('[CreateRoomPage] Step 3: Found ChatRoom by type:', chatRoomId)
                            } else {
                                // If no type match, use the first shared object
                                chatRoomId = txResponse.effects.sharedObjects[0]?.objectId
                                console.log('[CreateRoomPage] Step 3: Using first shared object:', chatRoomId)
                            }
                        }

                        // Fallback: Check created objects
                        if (!chatRoomId && txResponse.effects.created && txResponse.effects.created.length > 0) {
                            chatRoomId = txResponse.effects.created[0]?.reference?.objectId
                            console.log('[CreateRoomPage] Step 3: Found in created objects:', chatRoomId)
                        }
                    }

                    // Check object changes as fallback
                    if (!chatRoomId && txResponse.objectChanges) {
                        console.log('[CreateRoomPage] Step 3: Checking object changes...')
                        const createdChange = txResponse.objectChanges.find(
                            (change: any) => change.type === 'created'
                        )
                        if (createdChange && createdChange.type === 'created') {
                            chatRoomId = createdChange.objectId
                            console.log('[CreateRoomPage] Step 3: Found in object changes:', chatRoomId)
                        }
                    }
                } catch (error) {
                    console.error('[CreateRoomPage] Step 3: Failed to fetch transaction details:', error)
                }

                console.log('[CreateRoomPage] Final chatRoomId:', chatRoomId)
                if (chatRoomId) {
                    console.log('[CreateRoomPage] Navigating to room:', chatRoomId)
                    router.push(`/rooms/${chatRoomId}`)
                } else {
                    console.log('[CreateRoomPage] No room ID found, navigating to rooms list')
                    router.push('/rooms')
                }
            } else {
                logger.logError(new Error(result.error || 'Unknown error'), txParams)
                console.error('[CreateRoomPage] === Room creation failed ===', result.error)
                toast.error(`Failed to create room: ${result.error}`)
            }
        } catch (error: any) {
            console.error('[CreateRoomPage] === Error ===', error.message)
            console.error('[CreateRoomPage] Stack:', error.stack)
            toast.error(`Error creating room: ${error.message}`)
        } finally {
            setIsCreating(false)
            console.log('[CreateRoomPage] === End ===')
        }
    }

    const isLoading = isPending || isCreating || isLoadingProfile
    const canCreate = roomName.trim() && profile?.chatIndexId

    if (!account) {
        return (
            <div className="min-h-screen relative">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sign In Required</CardTitle>
                            <CardDescription>
                                Please sign in to create a chat room.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </main>
            </div>
        )
    }

    if (isLoadingProfile || (account && !isRegistered)) {
        return (
            <div className="min-h-screen relative">
                <Header />
                <main className="max-w-2xl mx-auto px-4 py-16">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="max-w-2xl mx-auto px-4 py-8 sm:py-16">
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        onClick={() => router.push('/rooms')}
                        className="mb-4"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Rooms
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            <CardTitle>Create Chat Room</CardTitle>
                        </div>
                        <CardDescription>
                            Create a new chat room. Choose between public or encrypted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                handleCreateRoom()
                            }}
                            className="space-y-6"
                        >
                            <div className="space-y-2">
                                <Label htmlFor="roomName">
                                    Room Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="roomName"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                    maxLength={100}
                                    placeholder="Enter room name"
                                    required
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Max 100 characters
                                </p>
                            </div>

                            <div className="space-y-4">
                                <Label>Room Type</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsEncrypted(false)}
                                        disabled={isLoading}
                                        className={`p-4 border-2 rounded-lg transition-all ${!isEncrypted
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Globe className="h-5 w-5" />
                                            <span className="font-medium">Public</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground text-left">
                                            Anyone can join and see messages
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsEncrypted(true)}
                                        disabled={isLoading}
                                        className={`p-4 border-2 rounded-lg transition-all ${isEncrypted
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="h-5 w-5" />
                                            <span className="font-medium">Encrypted</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground text-left">
                                            Invite-only with encrypted messages
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {isEncrypted && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                        <Lock className="inline h-4 w-4 mr-1" />
                                        Encrypted rooms require you to invite members. Messages are end-to-end encrypted.
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <Button
                                    type="submit"
                                    disabled={isLoading || !canCreate}
                                    className="flex-1"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <MessageSquare className="mr-2 h-4 w-4" />
                                            Create Room
                                        </>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.push('/rooms')}
                                    disabled={isLoading}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
