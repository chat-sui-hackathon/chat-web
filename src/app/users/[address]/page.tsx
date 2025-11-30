'use client'

import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useProfileByAddress } from '@/hooks/useUser'
import { formatAddress } from '@/lib/sui/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User, Calendar, Hash, Key, MessageSquare, Globe, Copy, Check } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import toast from 'react-hot-toast'

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const address = (params?.address as string | undefined) || null

  const { profile, isLoading, error, exists } = useProfileByAddress(address)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        </main>
      </div>
    )
  }

  if (error || !exists || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/users')}
              className="mb-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Users
            </Button>
          </div>
          <ErrorMessage
            message={error?.message || 'User profile not found'}
            onRetry={() => router.refresh()}
          />
        </main>
      </div>
    )
  }

  const avatarUrl = profile.avatarBlobId
    ? `https://aggregator.walrus-testnet.walrus.space/v1/${profile.avatarBlobId}`
    : null

  const publicKeyString = typeof profile.publicKey === 'string'
    ? profile.publicKey
    : profile.publicKey.length > 0
    ? Array.from(profile.publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : 'Not set'

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/users')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Button>
        </div>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={profile.displayName}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10">
                    <User className="h-12 w-12 text-primary" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-3xl mb-2">{profile.displayName}</CardTitle>
                <CardDescription className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4" />
                  <span className="font-mono">{profile.customId}</span>
                </CardDescription>
                {profile.createdAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Joined {new Date(profile.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Profile Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Wallet Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="h-5 w-5" />
                Wallet Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-mono text-sm break-all">{profile.owner}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(profile.owner, 'address')}
                  className="w-full"
                >
                  {copiedField === 'address' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Address
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Custom ID */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Custom ID
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm font-medium">{profile.customId}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(profile.customId, 'customId')}
                  className="w-full"
                >
                  {copiedField === 'customId' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Public Key */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="h-5 w-5" />
                Public Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {publicKeyString.length > 64
                    ? `${publicKeyString.slice(0, 32)}...${publicKeyString.slice(-32)}`
                    : publicKeyString || 'Not set'}
                </p>
                {publicKeyString && publicKeyString !== 'Not set' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(publicKeyString, 'publicKey')}
                    className="w-full"
                  >
                    {copiedField === 'publicKey' ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Public Key
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat Index */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chat Index
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {formatAddress(profile.chatIndexId, 8)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(profile.chatIndexId, 'chatIndex')}
                  className="w-full"
                >
                  {copiedField === 'chatIndex' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Chat Index ID
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bio Section */}
        {profile.bio && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{profile.bio}</p>
            </CardContent>
          </Card>
        )}

        {/* Social Media Links */}
        {profile.social && Object.keys(profile.social).length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Social Media
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(profile.social).map(([appName, url]) => (
                  <Badge key={appName} variant="secondary" className="text-sm py-1 px-3">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:underline"
                    >
                      <Globe className="h-3 w-3" />
                      {appName}
                    </a>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Additional Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profile ID:</span>
                <span className="font-mono text-xs">{formatAddress(profile.id, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span>
                  {profile.createdAt
                    ? new Date(profile.createdAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Unknown'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

