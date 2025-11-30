'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAccount, ConnectButton } from '@mysten/dapp-kit';
import { Header } from '@/components/common/Header';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useUser } from '@/hooks/useUser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Users, Shield, Zap } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const account = useCurrentAccount();
  const { profile, isLoading, isRegistered } = useUser();

  useEffect(() => {
    if (!account) return;

    if (!isLoading) {
      if (isRegistered && profile) {
        router.push('/rooms');
      } else if (!isRegistered) {
        router.push('/register');
      }
    }
  }, [account, isLoading, isRegistered, profile, router]);

  // Show welcome message if wallet is not connected
  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
            <Card className="w-full max-w-2xl">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-3xl mb-2">Welcome to Sui Chat</CardTitle>
                <CardDescription className="text-lg">
                  A decentralized chat application built on the Sui blockchain
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <p className="text-muted-foreground mb-6">
                    Connect your wallet to start chatting with others on the Sui network
                  </p>
                  <div className="flex justify-center">
                    <ConnectButton />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Secure & Private</h3>
                    <p className="text-sm text-muted-foreground">
                      End-to-end encryption for your conversations
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Decentralized</h3>
                    <p className="text-sm text-muted-foreground">
                      Built on Sui blockchain for true decentralization
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Fast & Reliable</h3>
                    <p className="text-sm text-muted-foreground">
                      Instant messaging with blockchain security
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Show loading spinner while checking registration status
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Header />
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    </div>
  );
}
