'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useChatRoom } from '@/hooks/useChatRooms'
import { useMessages } from '@/hooks/useMessages'
import { useUser } from '@/hooks/useUser'
import { parseChatObject } from '@/lib/sui/chat'
import { sendTextMessageTransaction } from '@/lib/sui/message'
import { createTransactionLogger } from '@/lib/sui/transaction-logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Send, Lock, Globe, Users, MessageSquare, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

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
  const { messages, messageCount, isLoading: isLoadingMessages, error: messagesError, refetch: refetchMessages } = useMessages(chatId)
  
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
  const { mutate: signAndExecuteTransaction, isPending } = useSignAndExecuteTransaction()

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

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
    if (!account || !chatId || !messageText.trim()) {
      return
    }

    setIsSending(true)

    try {
      const tx = new Transaction()
      sendTextMessageTransaction(tx, chatId, messageText.trim())

      const logger = createTransactionLogger('sendMessage')
      logger.logStart({ chatId, message: messageText.trim() }, tx)

      signAndExecuteTransaction(
        {
          transaction: tx,
        },
        {
          onSuccess: async (result) => {
            logger.logSuccess(result)
            toast.success('Message sent!')
            setMessageText('')
            // Refetch messages after a short delay to allow transaction to be indexed
            setTimeout(() => {
              refetchMessages()
            }, 2000)
          },
          onError: (error) => {
            logger.logError(error, { chatId, message: messageText.trim() })
            toast.error(`Failed to send message: ${error.message}`)
          },
          onSettled: () => {
            setIsSending(false)
          },
        }
      )
    } catch (error: any) {
      toast.error(`Error sending message: ${error.message}`)
      setIsSending(false)
    }
  }

  const isLoading = isLoadingRoom || isLoadingMessages
  const error = roomError || messagesError

  // Parse chat room data (after all hooks)
  const chatRoom = chatRoomData ? parseChatObject(chatRoomData) : null

  // Don't render content if redirecting (after all hooks)
  // But wait for user data to load to avoid false redirects on refresh
  if (account && !isLoadingUser && !isRegistered) {
    return null
  }

  if (!account) {
    return (
      <div className="min-h-screen relative">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Please connect your wallet to view this chat room.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen relative">
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
      <div className="min-h-screen relative">
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
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
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
                placeholder="Type a message..."
                disabled={isSending || isPending}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!messageText.trim() || isSending || isPending}
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
    </div>
  )
}

