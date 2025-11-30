'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import toast from 'react-hot-toast'
import { Header } from '@/components/common/Header'
import { createProfileTransaction } from '@/lib/sui/profile'
import { useUser } from '@/hooks/useUser'
import { useZkLoginKeypair, useSponsoredTransaction } from '@/hooks'
import { createTransactionLogger } from '@/lib/sui/transaction-logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, UserPlus, ArrowLeft, AlertCircle } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const account = useCurrentAccount()
  const { isLoading: isLoadingProfile, isRegistered } = useUser()
  const { derive: deriveKeypair, keypair, isLoading: isDerivingKey } = useZkLoginKeypair()
  const { execute: executeSponsoredTx, isPending: isExecuting } = useSponsoredTransaction()

  const [customId, setCustomId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarBlobId, setAvatarBlobId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect if user already has a profile
  useEffect(() => {
    if (account && !isLoadingProfile && isRegistered) {
      router.push('/rooms')
    }
  }, [account, isLoadingProfile, isRegistered, router])

  const handleRegister = async () => {
    console.log('[RegisterPage] === Starting registration ===')
    console.log('[RegisterPage] Account:', account?.address)

    if (!account) {
      console.error('[RegisterPage] Error: No account')
      toast.error('Please sign in first')
      return
    }

    if (!customId.trim()) {
      console.error('[RegisterPage] Error: Custom ID is required')
      toast.error('Custom ID is required')
      return
    }

    if (!displayName.trim()) {
      console.error('[RegisterPage] Error: Display name is required')
      toast.error('Display name is required')
      return
    }

    console.log('[RegisterPage] Form data:', {
      customId: customId.trim(),
      displayName: displayName.trim(),
      hasAvatarBlobId: !!avatarBlobId.trim(),
    })

    setIsSubmitting(true)

    try {
      // Step 1: Derive encryption keypair from zkLogin
      console.log('[RegisterPage] Step 1: Deriving encryption keypair...')
      const result = await deriveKeypair()
      if (!result || !result.keypair) {
        console.error('[RegisterPage] Step 1: Failed to derive keypair')
        toast.error('Failed to generate encryption key')
        setIsSubmitting(false)
        return
      }
      console.log('[RegisterPage] Step 1: Keypair derived successfully')
      console.log('[RegisterPage] Public key base64:', result.publicKeyBase64)

      // Step 2: Create profile transaction
      console.log('[RegisterPage] Step 2: Creating profile transaction...')
      const tx = new Transaction()
      const publicKeyBytes = result.keypair.publicKey

      const txParams = {
        customId: customId.trim(),
        displayName: displayName.trim(),
        avatarBlobId: avatarBlobId.trim() || '',
        publicKey: publicKeyBytes,
      }
      console.log('[RegisterPage] Step 2: Transaction params:', {
        ...txParams,
        publicKey: `[${publicKeyBytes.length} bytes]`,
      })

      createProfileTransaction(tx, txParams)
      console.log('[RegisterPage] Step 2: Profile transaction created')

      // Log transaction start
      const logger = createTransactionLogger('createProfile')
      logger.logStart(txParams, tx)

      // Step 3: Execute via sponsored transaction
      console.log('[RegisterPage] Step 3: Executing sponsored transaction...')
      const txResult = await executeSponsoredTx(tx)
      console.log('[RegisterPage] Step 3: Transaction result:', {
        success: txResult.success,
        digest: txResult.digest,
        error: txResult.error,
      })

      if (txResult.success) {
        logger.logSuccess(txResult)
        console.log('[RegisterPage] === Registration successful! ===')
        toast.success('Registration successful!')
        router.push('/rooms')
      } else {
        logger.logError(new Error(txResult.error || 'Unknown error'), txParams)
        console.error('[RegisterPage] === Registration failed ===', txResult.error)
        toast.error(`Registration failed: ${txResult.error}`)
      }
    } catch (error: any) {
      console.error('[RegisterPage] === Error ===', error.message)
      console.error('[RegisterPage] Stack:', error.stack)
      toast.error(`Registration error: ${error.message}`)
    } finally {
      setIsSubmitting(false)
      console.log('[RegisterPage] === End ===')
    }
  }

  const isLoading = isExecuting || isDerivingKey || isSubmitting
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
                Please sign in with Google to register for Iceb3rg.
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

        {/* Registration Required Notice */}
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Registration Required
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                You need to create a profile before you can use Sui Chat.
                This is a one-time setup that stores your profile on the blockchain.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle>Create Your Profile</CardTitle>
            </div>
            <CardDescription>
              Fill in your details below to complete registration. Your profile will be stored on-chain.
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
