'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentAccount } from '@mysten/dapp-kit'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { useChatRooms } from '@/hooks/useChatRooms'
import { useUser } from '@/hooks/useUser'
import type { ChatRoom } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Search, MessageSquare, Users, Lock, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortOption = 'name' | 'members' | 'messages'
type FilterOption = 'all' | 'public' | 'private'

export default function RoomsPage() {
  const router = useRouter()
  const account = useCurrentAccount()
  const { profile, isRegistered } = useUser()
  const chatIndexId = profile?.chatIndexId || null
  const { rooms, isLoading, error, refetch } = useChatRooms(chatIndexId)

  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterOption>('all')
  const [sortBy, setSortBy] = useState<SortOption>('messages')

  // Redirect if not registered (use useEffect to avoid render-time navigation)
  useEffect(() => {
    if (account && !isRegistered) {
      router.push('/register')
    }
  }, [account, isRegistered, router])

  // Filter and sort rooms (must be called before any early returns)
  const filteredAndSortedRooms = useMemo(() => {
    let filtered = rooms

    // Filter by type
    if (filter === 'public') {
      filtered = filtered.filter((room) => !room.isEncrypted)
    } else if (filter === 'private') {
      filtered = filtered.filter((room) => room.isEncrypted)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((room) =>
        room.name.toLowerCase().includes(query)
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'members':
          return b.members.length - a.members.length
        case 'messages':
          return b.messageCount - a.messageCount
        default:
          return 0
      }
    })

    return sorted
  }, [rooms, filter, searchQuery, sortBy])

  // Don't render content if redirecting (after all hooks)
  if (account && !isRegistered) {
    return null
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Please connect your wallet to view chat rooms.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chat Rooms</h1>
            <p className="text-muted-foreground mt-1">
              Join conversations or create your own room
            </p>
          </div>
          <Button asChild>
            <Link href="/rooms/create">
              <Plus className="mr-2 h-4 w-4" />
              Create Room
            </Link>
          </Button>
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
                  placeholder="Search rooms by name..."
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={filter} onValueChange={(value) => setFilter(value as FilterOption)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Rooms</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="messages">Most Active</SelectItem>
                    <SelectItem value="members">Most Members</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rooms List */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <ErrorMessage
            message={error.message || 'Failed to load chat rooms'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !error && (
          <>
            {filteredAndSortedRooms.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">No rooms found</p>
                    <p className="text-muted-foreground mb-4">
                      {searchQuery || filter !== 'all'
                        ? 'Try adjusting your search or filters'
                        : 'Be the first to create a chat room!'}
                    </p>
                    {!searchQuery && filter === 'all' && (
                      <Button asChild>
                        <Link href="/rooms/create">
                          <Plus className="mr-2 h-4 w-4" />
                          Create Room
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedRooms.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function RoomCard({ room }: { room: ChatRoom }) {
  return (
    <Link href={`/rooms/${room.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg line-clamp-2 flex-1">{room.name}</CardTitle>
            {room.isEncrypted ? (
              <Badge variant="secondary" className="shrink-0">
                <Lock className="h-3 w-3 mr-1" />
                Encrypted
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                <Globe className="h-3 w-3 mr-1" />
                Public
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>{room.messageCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{room.members.length}</span>
              </div>
            </div>
            {room.createdAt && (
              <p className="text-xs text-muted-foreground">
                Created {new Date(room.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
