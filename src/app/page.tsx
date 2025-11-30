'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { Header } from '@/components/common/Header'
import { LoginOptions } from '@/components/auth/LoginOptions'
import { useUser } from '@/hooks/useUser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Shield, Zap, Users, Loader2 } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const account = useCurrentAccount()
  const { profile, isLoading, isRegistered } = useUser()

  console.log('[HomePage] State:', {
    hasAccount: !!account,
    address: account?.address,
    isLoading,
    isRegistered,
    hasProfile: !!profile,
  })

  useEffect(() => {
    if (!account) return

    if (!isLoading) {
      if (isRegistered && profile) {
        console.log('[HomePage] User registered, redirecting to /rooms')
        router.push('/rooms')
      } else if (!isRegistered) {
        console.log('[HomePage] User not registered, redirecting to /register')
        router.push('/register')
      }
    }
  }, [account, isLoading, isRegistered, profile, router])

  // If logged in, show loading while checking registration status
  if (account) {
    return (
      <div className="min-h-screen relative">
        <Header />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto" />
            <p className="mt-4 text-muted-foreground">Checking registration status...</p>
          </div>
        </main>
      </div>
    )
  }

  // Not logged in - show welcome page
  return (
    <div className="min-h-screen relative">
      {/* Background Image */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/image.png)',
        }}
      >
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <div className="relative">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-8 sm:py-16">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              Iceb3rg
            </h1>
            <p className="text-xl text-zinc-200 max-w-2xl mx-auto">
              The Web3 chat that goes deep — Decentralized messaging on Sui blockchain with end-to-end encryption and zero gas fees
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-primary/10 rounded-full mb-3">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">Secure</h3>
                  <p className="text-sm text-muted-foreground">
                    End-to-end encrypted messages
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-primary/10 rounded-full mb-3">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">Zero Gas</h3>
                  <p className="text-sm text-muted-foreground">
                    Sponsored transactions
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-primary/10 rounded-full mb-3">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">On-chain</h3>
                  <p className="text-sm text-muted-foreground">
                    Messages stored on Sui
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-background/95 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-primary/10 rounded-full mb-3">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">Easy</h3>
                  <p className="text-sm text-muted-foreground">
                    No wallet needed
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Login Section */}
          <Card className="max-w-md mx-auto bg-background/95 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle>Get Started</CardTitle>
              <CardDescription>
                Sign in with your Google account to start chatting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginOptions />
            </CardContent>
          </Card>

          {/* Footer note */}
          <p className="text-center text-sm text-zinc-300 mt-8">
            Built on Sui blockchain with zkLogin for seamless authentication
          </p>
        </main>
      </div>
    </div>
  )
}
