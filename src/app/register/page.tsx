'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useSignPersonalMessage } from '@mysten/dapp-kit'
import toast from 'react-hot-toast'
import { Header } from '@/components/common/Header'
import { createProfileTransaction } from '@/lib/sui/profile'
import { useEncryptionKeypair } from '@/hooks/useEncryption'
import { useUser } from '@/hooks/useUser'
import { fromBase64 } from '@/lib/crypto'
import { createTransactionLogger } from '@/lib/sui/transaction-logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, UserPlus, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function RegisterPage() {
  const router = useRouter()
  const account = useCurrentAccount()
  const { profile, isLoading: isLoadingProfile, isRegistered } = useUser()
  const { mutate: signAndExecuteTransaction, isPending } = useSignAndExecuteTransaction()
  const { mutate: signPersonalMessage } = useSignPersonalMessage()
  const { loadKeypair, getPublicKeyBase64 } = useEncryptionKeypair()

  const [customId, setCustomId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarBlobId, setAvatarBlobId] = useState('')
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)

  // Redirect if user already has a profile
  useEffect(() => {
    if (account && !isLoadingProfile && isRegistered) {
      router.push('/rooms')
    }
  }, [account, isLoadingProfile, isRegistered, router])

  const handleRegister = async () => {
    if (!account) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!customId.trim()) {
      toast.error('Custom ID is required')
      return
    }

    if (!displayName.trim()) {
      toast.error('Display name is required')
      return
    }

    setIsGeneratingKey(true)

    try {
      // Step 1: Sign a message to derive encryption key
      signPersonalMessage(
        {
          message: new TextEncoder().encode('sui-chat:derive-encryption-key:v1'),
        },
        {
          onSuccess: async (result) => {
            try {
              // Step 2: Derive encryption keypair from signature
              // result.bytes is a base64 string, convert to Uint8Array
              const signature = typeof result.bytes === 'string'
                ? fromBase64(result.bytes)
                : new Uint8Array(result.bytes)
              const keypair = await loadKeypair(signature)

              if (!keypair || !keypair.publicKey) {
                toast.error('Failed to generate encryption key')
                setIsGeneratingKey(false)
                return
              }

              // Step 3: Create profile transaction
              const tx = new Transaction()
              // Use the public key directly from the keypair
              const publicKeyBytes = keypair.publicKey

              const txParams = {
                customId: customId.trim(),
                displayName: displayName.trim(),
                avatarBlobId: avatarBlobId.trim() || '',
                publicKey: publicKeyBytes,
              }

              createProfileTransaction(tx, txParams)

              // Log transaction start
              const logger = createTransactionLogger('createProfile')
              logger.logStart(txParams, tx)

              // Step 4: Execute transaction
              signAndExecuteTransaction(
                {
                  transaction: tx,
                },
                {
                  onSuccess: (result) => {
                    logger.logSuccess(result)
                    toast.success('Registration successful!')
                    router.push('/rooms')
                  },
                  onError: (error) => {
                    logger.logError(error, txParams)
                    toast.error(`Registration failed: ${error.message}`)
                    setIsGeneratingKey(false)
                  },
                }
              )
            } catch (error: any) {
              toast.error(`Failed to generate key: ${error.message}`)
              setIsGeneratingKey(false)
            }
          },
          onError: (error) => {
            toast.error(`Failed to sign message: ${error.message}`)
            setIsGeneratingKey(false)
          },
        }
      )
    } catch (error: any) {
      toast.error(`Registration error: ${error.message}`)
      setIsGeneratingKey(false)
    }
  }

  const isLoading = isPending || isGeneratingKey
  const isFormValid = customId.trim() && displayName.trim()

  // Show loading or redirect if already registered
  if (!account) {
    return (
      <div className="min-h-screen relative">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16">
          <Card>
            <CardHeader>
              <CardTitle>Registration Required</CardTitle>
              <CardDescription>
                Please connect your wallet to register for Iceb3rg.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    )
  }

  // Show loading while checking profile or redirecting
  if (isLoadingProfile || (account && isRegistered)) {
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
            onClick={() => router.push('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle>Create Your Profile</CardTitle>
            </div>
            <CardDescription>
              Register to start chatting on Sui. Your profile will be stored on-chain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleRegister()
              }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Label htmlFor="customId">
                  Custom ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customId"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  maxLength={100}
                  placeholder="Enter a unique identifier"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  A unique identifier for your profile. Max 100 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">
                  Display Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                  placeholder="Enter your display name"
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  This is how others will see you. Max 100 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarBlobId">Avatar Blob ID</Label>
                <Input
                  id="avatarBlobId"
                  value={avatarBlobId}
                  onChange={(e) => setAvatarBlobId(e.target.value)}
                  maxLength={500}
                  placeholder="Walrus blob ID for avatar (optional)"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Walrus storage blob ID for your avatar image. Optional.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={isLoading || !isFormValid}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Register
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/')}
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
