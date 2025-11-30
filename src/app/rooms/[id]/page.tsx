'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { Header } from '@/components/common/Header'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { useChatRoom } from '@/hooks/useChatRooms'
import { useMessages } from '@/hooks/useMessages'
import { useUser } from '@/hooks/useUser'
import { useSponsoredTransaction, useRoomKeyDecryption } from '@/hooks'
import { encryptMessage, decryptMessage } from '@/lib/crypto'
import { parseChatObject } from '@/lib/sui/chat'
import { PACKAGE_ID, MODULES } from '@/lib/types'
import { sendTextMessageTransaction } from '@/lib/sui/message'
import { createTransactionLogger } from '@/lib/sui/transaction-logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Send, Lock, Globe, Users, MessageSquare, Loader2, UserPlus, Copy, ExternalLink, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { InviteMemberDialog } from '@/components/chat/InviteMemberDialog'

export default function ChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const account = useCurrentAccount()
  const { isRegistered, isLoading: isLoadingUser } = useUser()

  // Ensure chatId is always defined (even if null) before hooks use it
  const chatId = (params?.id as string | undefined) || null

  // Log chatId to debug refresh issues
  useEffect(() => {
    console.log('[ChatRoomPage] Route params:', {
      params,
      chatId,
      url: typeof window !== 'undefined' ? window.location.href : 'server'
    })
  }, [params, chatId])

  const { data: chatRoomData, isLoading: isLoadingRoom, error: roomError, refetch: refetchChatRoom } = useChatRoom(chatId)
  const { messages: rawMessages, messageCount, isLoading: isLoadingMessages, error: messagesError, refetch: refetchMessages } = useMessages(chatId)
  const { execute: executeSponsoredTx, isPending } = useSponsoredTransaction()

  // Parse chat room data early so we can use it in hooks
  const chatRoom = useMemo(() => {
    return chatRoomData ? parseChatObject(chatRoomData) : null
  }, [chatRoomData])

  // Decrypt room key for encrypted chat rooms
  const { roomKey, isLoading: isDecryptingKey, error: keyError } = useRoomKeyDecryption(
    chatId,
    chatRoom?.isEncrypted ?? false
  )

  // Decrypt messages if room is encrypted
  const messages = useMemo(() => {
    if (!chatRoom?.isEncrypted || !roomKey) {
      return rawMessages
    }

    return rawMessages.map(msg => {
      try {
        const decryptedContent = decryptMessage(msg.content, roomKey)
        return {
          ...msg,
          content: decryptedContent || '[Decryption failed]',
          rawContent: msg.content, // Keep original for metadata display
        }
      } catch (e) {
        console.error('[ChatRoomPage] Failed to decrypt message:', e)
        return {
          ...msg,
          content: '[Decryption failed]',
          rawContent: msg.content,
        }
      }
    })
  }, [rawMessages, chatRoom?.isEncrypted, roomKey])

  // Log errors to debug redirect issues
  useEffect(() => {
    if (roomError) {
      console.error('[ChatRoomPage] Room error:', {
        chatId,
        error: roomError,
        errorMessage: roomError?.message,
        errorCode: (roomError as any)?.code
      })
    }
    if (messagesError) {
      console.error('[ChatRoomPage] Messages error:', {
        chatId,
        error: messagesError,
        errorMessage: messagesError?.message
      })
    }
  }, [chatId, roomError, messagesError])

  // Log messages hook usage
  useEffect(() => {
    console.log('[ChatRoomPage] useMessages hook status:', {
      chatId,
      messagesCount: messages.length,
      messageCount,
      isLoading: isLoadingMessages,
      error: messagesError?.message,
      hasMore: messageCount > messages.length
    })
  }, [chatId, messages, messageCount, isLoadingMessages, messagesError])

  const [messageText, setMessageText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Helper to copy text to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  // Get SuiScan URL for object
  const getSuiScanUrl = (objectId: string) => {
    const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet'
    return `https://suiscan.xyz/${network}/object/${objectId}`
  }

  // Redirect if not registered (but only if we have account, confirmed not registered, and user data is loaded)
  useEffect(() => {
    // Wait for user data to load before redirecting to avoid false redirects on refresh
    if (account && !isLoadingUser && !isRegistered) {
      console.log('[ChatRoomPage] Redirecting to register - user not registered')
      router.push('/register')
    }
  }, [account, isRegistered, isLoadingUser, router])

  // Ensure chatId is valid before proceeding
  useEffect(() => {
    if (!chatId && params?.id) {
      console.warn('[ChatRoomPage] Invalid chatId from params:', { params, chatId })
    }
  }, [chatId, params])

  // Scroll to bottom when new messages arrive, but only if user is near the bottom
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    // Check if user is near the bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100

    // Only auto-scroll if user is near bottom or if it's the first load
    if (isNearBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSendMessage = async () => {
    console.log('[ChatRoomPage] === Starting send message ===')
    console.log('[ChatRoomPage] Account:', account?.address)
    console.log('[ChatRoomPage] Chat ID:', chatId)
    console.log('[ChatRoomPage] Message:', messageText.trim())
    console.log('[ChatRoomPage] Is encrypted room:', chatRoom?.isEncrypted)
    console.log('[ChatRoomPage] Room key available:', !!roomKey)
    console.log('[ChatRoomPage] ChatRoom object:', chatRoom ? { id: chatRoom.id, name: chatRoom.name, isEncrypted: chatRoom.isEncrypted } : null)

    // Log type information for debugging TypeMismatch errors
    const expectedType = `${PACKAGE_ID}::${MODULES.CHAT}::ChatRoom`
    const actualType = chatRoomData?.data?.content?.dataType === 'moveObject'
      ? (chatRoomData.data.content as any).type
      : 'unknown'
    console.log('[ChatRoomPage] Type verification:', {
      expectedType,
      actualType,
      typesMatch: actualType === expectedType,
      packageId: PACKAGE_ID,
    })

    if (actualType !== expectedType && actualType !== 'unknown') {
      console.error('[ChatRoomPage] ERROR: ChatRoom type mismatch!')
      console.error('[ChatRoomPage] This usually means the contract was redeployed with a new package ID.')
      console.error('[ChatRoomPage] You need to create a new chat room with the current package.')
      toast.error('Chat room is from an old contract version. Please create a new room.')
      return
    }

    if (!account || !chatId || !messageText.trim()) {
      console.error('[ChatRoomPage] Error: Missing account, chatId, or message')
      return
    }

    if (!chatRoom) {
      console.error('[ChatRoomPage] Error: Chat room not loaded')
      toast.error('Unable to send: Chat room not loaded')
      return
    }

    // Check if we need room key for encrypted rooms
    if (chatRoom.isEncrypted && !roomKey) {
      console.error('[ChatRoomPage] Error: Room key not available for encrypted room')
      toast.error('Unable to send: Room key not decrypted')
      return
    }

    setIsSending(true)

    try {
      // Encrypt message if room is encrypted
      let messageToSend = messageText.trim()
      if (chatRoom?.isEncrypted && roomKey) {
        console.log('[ChatRoomPage] Step 1: Encrypting message...')
        messageToSend = encryptMessage(messageText.trim(), roomKey)
        console.log('[ChatRoomPage] Step 1: Message encrypted, length:', messageToSend.length)
      }

      console.log('[ChatRoomPage] Step 2: Creating send message transaction...')
      console.log('[ChatRoomPage] Step 2: Verifying chatId consistency:', {
        urlChatId: chatId,
        parsedChatRoomId: chatRoom.id,
        idsMatch: chatId === chatRoom.id,
        chatIdType: typeof chatId,
        chatIdLength: chatId?.length,
      })

      // Use chatRoom.id to ensure we're using the verified object ID
      const targetChatId = chatRoom.id
      console.log('[ChatRoomPage] Step 2: Using targetChatId:', targetChatId)

      const tx = new Transaction()
      sendTextMessageTransaction(tx, targetChatId, messageToSend)
      console.log('[ChatRoomPage] Step 2: Transaction created with:', {
        targetChatId,
        messageLength: messageToSend.length,
        messagePreview: messageToSend.substring(0, 50) + (messageToSend.length > 50 ? '...' : ''),
      })

      const logger = createTransactionLogger('sendMessage')
      logger.logStart({ chatId, message: messageText.trim() }, tx)

      console.log('[ChatRoomPage] Step 2: Executing sponsored transaction...')
      const result = await executeSponsoredTx(tx)
      console.log('[ChatRoomPage] Step 2: Transaction result:', {
        success: result.success,
        digest: result.digest,
        error: result.error,
      })

      if (result.success) {
        logger.logSuccess(result)
        console.log('[ChatRoomPage] === Message sent successfully! ===')
        toast.success('Message sent!')
        setMessageText('')
        // Refetch messages after a short delay to allow transaction to be indexed
        console.log('[ChatRoomPage] Scheduling message refetch in 2 seconds...')
        setTimeout(() => {
          console.log('[ChatRoomPage] Refetching messages...')
          refetchMessages()
        }, 2000)
      } else {
        logger.logError(new Error(result.error || 'Unknown error'), { chatId, message: messageText.trim() })
        console.error('[ChatRoomPage] === Message send failed ===', result.error)
        toast.error(`Failed to send message: ${result.error}`)
      }
    } catch (error: any) {
      console.error('[ChatRoomPage] === Error ===', error.message)
      console.error('[ChatRoomPage] Stack:', error.stack)
      toast.error(`Error sending message: ${error.message}`)
    } finally {
      setIsSending(false)
      console.log('[ChatRoomPage] === End ===')
    }
  }

  const isLoading = isLoadingRoom || isLoadingMessages || isDecryptingKey
  const error = roomError || messagesError || keyError

  // Don't render content if redirecting (after all hooks)
  // But wait for user data to load to avoid false redirects on refresh
  if (account && !isLoadingUser && !isRegistered) {
    return null
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Please sign in to view this chat room.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !chatRoom) {
    // Don't redirect, just show error - allow user to stay on page
    // This handles cases where chat room might not be in user's list but is accessible
    console.log('[ChatRoomPage] Showing error state:', {
      chatId,
      hasError: !!error,
      hasChatRoom: !!chatRoom,
      errorMessage: error?.message,
      isLoadingRoom,
      isLoadingMessages
    })

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/rooms')}
              className="mb-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Rooms
            </Button>
          </div>
          <ErrorMessage
            message={error?.message || 'Chat room not found'}
            onRetry={() => {
              if (error) {
                console.log('[ChatRoomPage] Retrying after error...')
                refetchChatRoom()
                refetchMessages()
              }
            }}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="max-w-4xl mx-auto w-full px-4 py-4 flex flex-col flex-1">
        {/* Header */}
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/rooms')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Rooms
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{chatRoom.name}</CardTitle>
                  {/* ChatRoom Object ID */}
                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {chatId?.slice(0, 8)}...{chatId?.slice(-6)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => chatId && copyToClipboard(chatId, 'Object ID')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => chatId && window.open(getSuiScanUrl(chatId), '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      <span>{messageCount} messages</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{chatRoom.members.length} members</span>
                    </div>
                    {chatRoom.createdAt && (
                      <span>
                        Created {new Date(chatRoom.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Only show invite button for encrypted rooms */}
                  {chatRoom.isEncrypted && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInviteDialog(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Invite
                    </Button>
                  )}
                  {chatRoom.isEncrypted ? (
                    <Badge variant="secondary">
                      <Lock className="h-3 w-3 mr-1" />
                      Encrypted
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Globe className="h-3 w-3 mr-1" />
                      Public
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Messages */}
        <Card className="flex-1 flex flex-col mb-4">
          <CardContent ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages yet. Be the first to send a message!</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.messageIndex}-${index}`}
                  className={`flex ${message.sender === account.address ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="relative group">
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${message.sender === account.address
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                        }`}
                    >
                      <div className="text-xs opacity-70 mb-1">
                        {message.sender === account.address ? 'You' : `${message.sender.slice(0, 8)}...`}
                      </div>
                      <div className="break-words">{message.content}</div>
                      <div className="text-xs opacity-70 mt-1 flex items-center gap-2">
                        <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                        <button
                          onClick={() => setSelectedMessageIndex(
                            selectedMessageIndex === message.messageIndex ? null : message.messageIndex
                          )}
                          className="opacity-50 hover:opacity-100 transition-opacity"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Message Metadata Popup */}
                    {selectedMessageIndex === message.messageIndex && (
                      <div className={`absolute z-10 mt-2 p-3 bg-popover border rounded-lg shadow-lg text-sm w-72 ${
                        message.sender === account.address ? 'right-0' : 'left-0'
                      }`}>
                        <div className="font-semibold mb-2 flex items-center justify-between">
                          <span>Message Metadata</span>
                          <button
                            onClick={() => setSelectedMessageIndex(null)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Message Index:</span>
                            <span className="ml-2 font-mono">{message.messageIndex}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sender:</span>
                            <div className="font-mono break-all mt-1">{message.sender}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Content Type:</span>
                            <span className="ml-2">{message.contentType === 0 ? 'Text' : message.contentType === 1 ? 'Image' : 'File'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              {chatRoom.isEncrypted ? 'Encrypted Content (on-chain):' : 'Raw Content:'}
                            </span>
                            <div className="font-mono break-all mt-1 bg-muted p-2 rounded max-h-20 overflow-auto">
                              {(message as any).rawContent || message.content}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Timestamp:</span>
                            <span className="ml-2">{new Date(message.timestamp).toISOString()}</span>
                          </div>
                          <div className="pt-2 border-t flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => chatId && window.open(getSuiScanUrl(chatId), '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View on SuiScan
                            </Button>
                          </div>
                          {chatRoom.isEncrypted && (
                            <p className="text-muted-foreground text-xs italic">
                              This message is stored encrypted on-chain. Check SuiScan to verify.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </CardContent>
        </Card>

        {/* Message Input */}
        <Card>
          <CardContent className="pt-6">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              className="flex gap-2"
            >
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={
                  chatRoom.isEncrypted && !roomKey
                    ? 'Decrypting room key...'
                    : chatRoom.isEncrypted
                    ? 'Type an encrypted message...'
                    : 'Type a message...'
                }
                disabled={isSending || isPending || (chatRoom.isEncrypted && !roomKey)}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!messageText.trim() || isSending || isPending || (chatRoom.isEncrypted && !roomKey)}
              >
                {isSending || isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      {/* Invite Member Dialog */}
      {showInviteDialog && chatId && (
        <InviteMemberDialog
          chatId={chatId}
          isEncrypted={chatRoom.isEncrypted}
          currentMembers={chatRoom.members}
          onClose={() => setShowInviteDialog(false)}
          onInviteSuccess={() => {
            refetchChatRoom()
          }}
        />
      )}
    </div>
  )
}
