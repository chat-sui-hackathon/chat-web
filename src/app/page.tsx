'use client';

import { ConnectButton, useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

export default function Home() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  // Example: Query owned objects for the connected account
  const { data: ownedObjects, isPending, error } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address || '',
      options: {
        showType: true,
        showContent: true,
        showDisplay: true,
      },
    },
    {
      enabled: !!account?.address,
    },
  );

  const handleTestTransaction = () => {
    if (!account) {
      alert('Please connect your wallet first');
      return;
    }

    const tx = new Transaction();
    // Example: Transfer SUI to yourself (a simple test transaction)
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1000)]);
    tx.transferObjects([coin], account.address);

    signAndExecuteTransaction(
      {
        transaction: tx,
      },
      {
        onSuccess: (result) => {
          console.log('Transaction executed successfully:', result);
          alert(`Transaction successful! Digest: ${result.digest}`);
        },
        onError: (error) => {
          console.error('Transaction failed:', error);
          alert(`Transaction failed: ${error.message}`);
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-start py-16 px-8 bg-white dark:bg-black">
        <div className="w-full flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Sui Chat
          </h1>
          <ConnectButton />
        </div>

        {account && (
          <div className="w-full space-y-6">
            <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                Wallet Info
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 break-all">
                <strong>Address:</strong> {account.address}
              </p>
            </div>

            <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                Owned Objects
              </h2>
              {isPending && <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>}
              {error && (
                <p className="text-red-600 dark:text-red-400">
                  Error: {error.message}
                </p>
              )}
              {ownedObjects && (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Total objects: {ownedObjects.data.length}
                  </p>
                  {ownedObjects.data.length > 0 ? (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {ownedObjects.data.map((obj) => (
                        <li
                          key={obj.data?.objectId}
                          className="text-xs p-2 bg-white dark:bg-zinc-800 rounded break-all"
                        >
                          <strong>ID:</strong> {obj.data?.objectId}
                          <br />
                          <strong>Type:</strong> {obj.data?.type}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      No objects found
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold mb-4 text-black dark:text-zinc-50">
                Test Transaction
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                This will create a simple transaction that transfers 1000 MIST to yourself.
              </p>
              <button
                onClick={handleTestTransaction}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Execute Test Transaction
              </button>
            </div>
          </div>
        )}

        {!account && (
          <div className="text-center space-y-4">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Connect your wallet to get started
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
