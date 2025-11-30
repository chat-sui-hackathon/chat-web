// Header component

'use client';

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';

export function Header() {
  const account = useCurrentAccount();
  const { profile } = useUser();

  return (
    <header className="relative z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-black/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-2xl font-semibold text-black dark:text-zinc-50">
              Iceb3rg
            </Link>
          </div>

          <nav className="flex items-center space-x-4">
            {account && profile && (
              <>
                <Link
                  href="/rooms"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50"
                >
                  Rooms
                </Link>
                <Link
                  href="/users"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50"
                >
                  Users
                </Link>
                <Link
                  href={`/users/${account.address}`}
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-zinc-50 transition-colors"
                >
                  {profile.displayName}
                </Link>
              </>
            )}
            <ConnectButton />
          </nav>
        </div>
      </div>
    </header>
  );
}

