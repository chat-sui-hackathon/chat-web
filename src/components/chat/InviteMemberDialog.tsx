'use client'

import { useState, useMemo } from 'react'
import { useAllProfiles } from '@/hooks/useAllProfiles'
import { useInviteMember } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, X, UserPlus, Search, Key, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

interface InviteMemberDialogProps {
  chatId: string
  isEncrypted: boolean
  currentMembers: string[] // List of member addresses
  onClose: () => void
  onInviteSuccess?: () => void
}

export function InviteMemberDialog({
  chatId,
  isEncrypted,
  currentMembers,
  onClose,
  onInviteSuccess,
}: InviteMemberDialogProps) {
  const { data: allProfiles, isLoading: isLoadingProfiles } = useAllProfiles()
  const { inviteMember, isInviting } = useInviteMember()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)

  // Filter out current members and search by name/customId
  const availableProfiles = useMemo(() => {
    if (!allProfiles) return []

    return allProfiles.filter((profile) => {
      // Exclude current members
      if (currentMembers.includes(profile.owner)) return false

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesName = profile.displayName.toLowerCase().includes(query)
        const matchesId = profile.customId.toLowerCase().includes(query)
        if (!matchesName && !matchesId) return false
      }

      return true
    })
  }, [allProfiles, currentMembers, searchQuery])

  const handleInvite = async () => {
    if (!selectedProfile) return

    console.log('[InviteMemberDialog] Inviting:', selectedProfile.displayName)

    const result = await inviteMember(chatId, selectedProfile, isEncrypted)

    if (result.success) {
      toast.success(`Invited ${selectedProfile.displayName}!`)
      onInviteSuccess?.()
      onClose()
    } else {
      toast.error(`Failed to invite: ${result.error}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Invite Member</h2>
            {isEncrypted && (
              <Badge variant="secondary" className="ml-2">
                <Key className="h-3 w-3 mr-1" />
                Encrypted
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="pl-10"
            />
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoadingProfiles ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableProfiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No users available to invite</p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableProfiles.map((profile) => (
                <button
                  key={profile.owner}
                  onClick={() => setSelectedProfile(
                    selectedProfile?.owner === profile.owner ? null : profile
                  )}
                  className={`w-full p-3 rounded-lg border transition-colors text-left ${
                    selectedProfile?.owner === profile.owner
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{profile.displayName}</p>
                      <p className="text-sm text-muted-foreground">@{profile.customId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEncrypted && !profile.publicKey && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          No Key
                        </Badge>
                      )}
                      {isEncrypted && profile.publicKey && (
                        <Badge variant="outline" className="text-xs">
                          <Key className="h-3 w-3 mr-1" />
                          Has Key
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t">
          <Button
            onClick={handleInvite}
            disabled={!selectedProfile || isInviting || (isEncrypted && !selectedProfile?.publicKey)}
            className="flex-1"
          >
            {isInviting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite {selectedProfile?.displayName || 'Member'}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isInviting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
