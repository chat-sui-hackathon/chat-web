'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/common/Header'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { useAllProfiles } from '@/hooks/useAllProfiles'
import { formatAddress } from '@/lib/sui/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Search, User, Calendar, Hash } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { Profile } from '@/lib/types'

type SortOption = 'newest' | 'oldest' | 'name'

export default function UsersPage() {
  const { data: profiles, isLoading, error, refetch } = useAllProfiles()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

  // Filter and sort profiles
  const filteredAndSortedProfiles = useMemo(() => {
    if (!profiles) return []

    let filtered = profiles

    // Filter by search query (search in display name, custom ID, or address)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (profile) =>
          profile.displayName.toLowerCase().includes(query) ||
          profile.customId.toLowerCase().includes(query) ||
          profile.owner.toLowerCase().includes(query)
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.displayName.localeCompare(b.displayName)
        case 'oldest':
          return a.createdAt - b.createdAt
        case 'newest':
        default:
          return b.createdAt - a.createdAt
      }
    })

    return sorted
  }, [profiles, searchQuery, sortBy])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">
            Browse all registered users on the platform
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, ID, or address..."
                  className="pl-9"
                />
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <ErrorMessage
            message={error instanceof Error ? error.message : 'Failed to load users'}
            onRetry={() => refetch()}
          />
        )}

        {/* Profiles List */}
        {!isLoading && !error && (
          <>
            {filteredAndSortedProfiles.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">No users found</p>
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? 'Try adjusting your search query'
                        : 'No users have registered yet'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mb-4 text-sm text-muted-foreground">
                  Showing {filteredAndSortedProfiles.length} of {profiles?.length || 0} users
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAndSortedProfiles.map((profile) => (
                    <ProfileCard key={profile.id} profile={profile} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ProfileCard({ profile }: { profile: Profile }) {
  const avatarUrl = profile.avatarBlobId
    ? `https://aggregator.walrus-testnet.walrus.space/v1/${profile.avatarBlobId}`
    : null

  return (
    <Link href={`/users/${profile.owner}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={profile.displayName}
                fill
                className="object-cover"
                onError={(e) => {
                  // Fallback to placeholder if image fails to load
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg line-clamp-2">{profile.displayName}</CardTitle>
            <CardDescription className="mt-1">
              <div className="flex items-center gap-1 text-xs">
                <Hash className="h-3 w-3" />
                <span className="truncate">{profile.customId}</span>
              </div>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-sm">
            <p className="text-muted-foreground mb-1">Address</p>
            <p className="font-mono text-xs break-all">{formatAddress(profile.owner, 6)}</p>
          </div>
          {profile.createdAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                Joined {new Date(profile.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </Link>
  )
}

