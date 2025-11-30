"use client";

import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useConnectWallet,
  useDisconnectWallet,
  useWallets,
  useSuiClient,
  useCurrentWallet,
} from "@mysten/dapp-kit";
import { getSession as getEnokiSession, isEnokiWallet } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import { useAuthMethod, useSponsoredTransaction } from "@/hooks";
import {
  deriveEncryptionKeypairFromZkLogin,
  toBase64,
  initCrypto,
  type ZkLoginClaims,
} from "@/lib/crypto";
import Link from "next/link";

type LogEntry = {
  time: string;
  type: "info" | "success" | "error" | "warning";
  message: string;
};

type DerivedKeypair = {
  publicKey: string;
  secretKey: string;
};

export default function TestPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [derivedKeypair, setDerivedKeypair] = useState<DerivedKeypair | null>(
    null
  );
  const [derivationCount, setDerivationCount] = useState(0);
  const [manualJwt, setManualJwt] = useState("");
  const [showJwtInput, setShowJwtInput] = useState(false);

  // Fix hydration mismatch - wallets are only available on client
  useEffect(() => {
    setMounted(true);
    initCrypto(); // Initialize libsodium
  }, []);

  const account = useCurrentAccount();
  const wallets = useWallets();
  const suiClient = useSuiClient();
  const { currentWallet } = useCurrentWallet();
  const { mutate: connectWallet, isPending: isConnecting } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { authMethod, isZkLogin } = useAuthMethod();
  const { execute: executeSponsoredTx, isPending: isSponsoredPending } =
    useSponsoredTransaction();

  // Find zkLogin wallet (Enoki/Google)
  const zkLoginWallet = wallets.find(
    (w) =>
      w.name.toLowerCase().includes("google") ||
      w.name.toLowerCase().includes("enoki")
  );

  const addLog = (type: LogEntry["type"], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, type, message }]);
  };

  const clearLogs = () => setLogs([]);

  const handleConnectZkLogin = () => {
    if (!zkLoginWallet) {
      addLog(
        "error",
        "zkLogin wallet not found. Check NEXT_PUBLIC_ENOKI_PUBLIC_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID"
      );
      return;
    }

    addLog("info", `Connecting via ${zkLoginWallet.name}...`);
    connectWallet(
      { wallet: zkLoginWallet },
      {
        onSuccess: (data) => {
          addLog("info", `Connected data: ${JSON.stringify(data)}`);
          addLog("success", "Connected successfully!");
        },
        onError: (error) => {
          addLog("error", `Connection failed: ${error.message}`);
        },
      }
    );
  };

  const handleDisconnect = () => {
    disconnect();
    addLog("info", "Disconnected");
  };

  const handleSponsoredTransaction = async () => {
    if (!account) {
      addLog("error", "Please connect wallet first");
      return;
    }

    setIsLoading(true);
    addLog("info", "Building transaction...");

    try {
      const tx = new Transaction();

      // Simple transaction: call a public Move function
      // 使用 Sui Framework 的 clock module 來測試（不需要任何 coin）
      // 這只是讀取當前時間戳，不會改變任何狀態
      tx.moveCall({
        target: "0x2::clock::timestamp_ms",
        arguments: [tx.object("0x6")], // Clock object ID is always 0x6
      });

      addLog("info", "Requesting sponsored transaction...");
      addLog("info", `Sender: ${account.address}`);

      const result = await executeSponsoredTx(tx);

      if (result.success) {
        addLog("success", `Transaction successful!`);
        addLog("success", `Digest: ${result.digest}`);
        addLog(
          "info",
          `View on explorer: https://suiscan.xyz/testnet/tx/${result.digest}`
        );
      } else {
        addLog("error", `Transaction failed: ${result.error}`);
      }
    } catch (error) {
      addLog(
        "error",
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckBalance = async () => {
    if (!account) {
      addLog("error", "Please connect wallet first");
      return;
    }

    try {
      addLog("info", "Fetching balance...");
      const balance = await suiClient.getBalance({ owner: account.address });
      const suiBalance = Number(balance.totalBalance) / 1_000_000_000;
      addLog("success", `Balance: ${suiBalance.toFixed(4)} SUI`);
    } catch (error) {
      addLog(
        "error",
        `Failed to fetch balance: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // Helper to decode JWT payload
  const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) return null;
      const payload = parts[1];
      const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  };

  // Storage key for JWT (must match auth/callback/page.tsx)
  const ZKLOGIN_JWT_KEY = "sui-chat:zklogin-jwt";

  // Get JWT from wallet's enoki:getSession feature or storage
  const getEnokiJwt = async (): Promise<string | null> => {
    if (typeof window === "undefined") return null;

    // First check manual input
    if (manualJwt) {
      console.log("Using manually provided JWT");
      return manualJwt;
    }

    // Try to get JWT from wallet's enoki:getSession feature
    if (currentWallet) {
      console.log("Current wallet:", currentWallet.name);
      console.log(
        "Checking wallet features:",
        Object.keys(currentWallet.features || {})
      );

      if (isEnokiWallet(currentWallet)) {
        console.log("Current wallet is an Enoki wallet");
        try {
          const session = await getEnokiSession(currentWallet);
          console.log("Session from wallet:", session);
          if (session?.jwt) {
            console.log("Got JWT from wallet session");
            return session.jwt;
          } else {
            console.log(
              "Wallet session has no JWT:",
              JSON.stringify(session, null, 2)
            );
          }
        } catch (e) {
          console.error("Error getting session from wallet:", e);
        }
      } else {
        console.log("Current wallet is not an Enoki wallet");
      }
    }

    // Then check our own stored JWT
    const storedJwt = localStorage.getItem(ZKLOGIN_JWT_KEY);
    if (storedJwt) {
      console.log("Found JWT in our storage key");
      return storedJwt;
    }

    // Debug: print all storage keys
    console.log("localStorage keys:", Object.keys(localStorage));
    console.log("sessionStorage keys:", Object.keys(sessionStorage));

    // Helper to search storage
    const searchStorage = (
      storage: Storage,
      storageName: string
    ): string | null => {
      for (const key of Object.keys(storage)) {
        try {
          const value = storage.getItem(key);
          if (!value) continue;

          // Try to parse as JSON
          try {
            const parsed = JSON.parse(value);

            // Look for common JWT field names
            const jwtFields = [
              "jwt",
              "idToken",
              "id_token",
              "token",
              "accessToken",
              "access_token",
            ];
            for (const field of jwtFields) {
              if (
                parsed[field] &&
                typeof parsed[field] === "string" &&
                parsed[field].includes(".")
              ) {
                console.log(`Found JWT in ${storageName}.${key}.${field}`);
                return parsed[field];
              }
            }

            // Search nested objects
            if (typeof parsed === "object") {
              const searchNested = (
                obj: Record<string, unknown>,
                path: string
              ): string | null => {
                for (const [k, v] of Object.entries(obj)) {
                  if (
                    typeof v === "string" &&
                    v.includes(".") &&
                    v.split(".").length === 3
                  ) {
                    const decoded = v.split(".")[1];
                    try {
                      atob(decoded.replace(/-/g, "+").replace(/_/g, "/"));
                      console.log(`Found JWT at ${storageName}.${path}.${k}`);
                      return v;
                    } catch {
                      // Not valid base64
                    }
                  }
                  if (typeof v === "object" && v !== null) {
                    const result = searchNested(
                      v as Record<string, unknown>,
                      `${path}.${k}`
                    );
                    if (result) return result;
                  }
                }
                return null;
              };
              const result = searchNested(parsed, key);
              if (result) return result;
            }
          } catch {
            // Not JSON, check if raw JWT
            if (value.includes(".") && value.split(".").length === 3) {
              try {
                const decoded = value.split(".")[1];
                atob(decoded.replace(/-/g, "+").replace(/_/g, "/"));
                console.log(`Found raw JWT in ${storageName}.${key}`);
                return value;
              } catch {
                // Not valid JWT
              }
            }
          }
        } catch (e) {
          console.error(`Error checking ${storageName}.${key}:`, e);
        }
      }
      return null;
    };

    // Check localStorage first
    let jwt = searchStorage(localStorage, "localStorage");
    if (jwt) return jwt;

    // Then check sessionStorage
    jwt = searchStorage(sessionStorage, "sessionStorage");
    if (jwt) return jwt;

    console.log("No JWT found in any storage");
    return null;
  };

  const handleDeriveKeypair = async () => {
    if (!account) {
      addLog("error", "Please connect wallet first");
      return;
    }

    if (!isZkLogin) {
      addLog(
        "error",
        "This test only works with zkLogin. Please connect via Google."
      );
      return;
    }

    setIsLoading(true);
    addLog("info", "Deriving encryption keypair from zkLogin...");

    try {
      // 1. Get JWT from Enoki session
      addLog("info", "Looking for JWT in wallet session...");
      const jwt = await getEnokiJwt();
      if (!jwt) {
        addLog("error", "Could not find JWT in session. Try reconnecting.");
        return;
      }

      // 2. Decode JWT to get claims
      const payload = decodeJwtPayload(jwt);
      if (!payload) {
        addLog("error", "Failed to decode JWT");
        return;
      }

      const sub = payload.sub as string;
      const iss = payload.iss as string;
      const aud = (
        Array.isArray(payload.aud) ? payload.aud[0] : payload.aud
      ) as string;

      addLog("info", `JWT sub: ${sub}`);
      addLog("info", `JWT iss: ${iss}`);
      addLog("info", `JWT aud: ${aud.slice(0, 20)}...`);

      // 3. Get userSalt from Enoki API
      addLog("info", "Fetching userSalt from Enoki...");
      const saltResponse = await fetch("/api/zklogin/salt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jwt }),
      });

      if (!saltResponse.ok) {
        const errorData = await saltResponse.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to get salt: ${saltResponse.status}`
        );
      }

      const saltData = await saltResponse.json();
      const userSalt = saltData.userSalt;

      if (!userSalt) {
        addLog("error", `Salt response: ${JSON.stringify(saltData)}`);
        throw new Error("userSalt not found in response");
      }

      addLog("info", `userSalt: ${userSalt.slice(0, 10)}...`);

      // 4. Derive keypair
      const claims: ZkLoginClaims = { sub, iss, aud, userSalt };
      const keypair = await deriveEncryptionKeypairFromZkLogin(claims);
      const publicKeyBase64 = toBase64(keypair.publicKey);
      const secretKeyBase64 = toBase64(keypair.secretKey);

      // 5. Check if it matches previous derivation
      setDerivationCount((prev) => prev + 1);

      addLog("info", `Public Key:  ${publicKeyBase64}`);
      addLog("info", `Secret Key:  ${secretKeyBase64}`);

      if (derivedKeypair === null) {
        setDerivedKeypair({
          publicKey: publicKeyBase64,
          secretKey: secretKeyBase64,
        });
        addLog(
          "success",
          `First derivation complete - keypair stored for comparison`
        );
      } else {
        const publicKeyMatch = derivedKeypair.publicKey === publicKeyBase64;
        const secretKeyMatch = derivedKeypair.secretKey === secretKeyBase64;

        if (publicKeyMatch && secretKeyMatch) {
          addLog(
            "success",
            `Derivation #${
              derivationCount + 1
            } - FULL MATCH! Both keys are identical.`
          );
        } else {
          addLog("error", `Derivation #${derivationCount + 1} - MISMATCH!`);
          if (!publicKeyMatch) {
            addLog("error", `Public Key MISMATCH:`);
            addLog("error", `  Previous: ${derivedKeypair.publicKey}`);
            addLog("error", `  Current:  ${publicKeyBase64}`);
          } else {
            addLog("success", `Public Key: MATCH`);
          }
          if (!secretKeyMatch) {
            addLog("error", `Secret Key MISMATCH:`);
            addLog("error", `  Previous: ${derivedKeypair.secretKey}`);
            addLog("error", `  Current:  ${secretKeyBase64}`);
          } else {
            addLog("success", `Secret Key: MATCH`);
          }
        }
      }
    } catch (error) {
      addLog(
        "error",
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDerivation = () => {
    setDerivedKeypair(null);
    setDerivationCount(0);
    addLog("info", "Reset derivation state. Ready for new test.");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">
            zkLogin + Sponsored TX Test
          </h1>
          <p className="text-zinc-400">
            Test page for zkLogin authentication and sponsored transactions
          </p>
        </div>

        {/* Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Connection Status */}
          <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <h2 className="text-lg font-semibold mb-4">Connection Status</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Status:</span>
                <span
                  className={account ? "text-green-400" : "text-yellow-400"}
                >
                  {account ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Auth Method:</span>
                <span className={isZkLogin ? "text-blue-400" : "text-zinc-300"}>
                  {authMethod || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">zkLogin Available:</span>
                <span
                  className={
                    !mounted
                      ? "text-zinc-500"
                      : zkLoginWallet
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {!mounted ? "..." : zkLoginWallet ? "Yes" : "No"}
                </span>
              </div>
              {account && (
                <div className="pt-2 border-t border-zinc-800">
                  <span className="text-zinc-400 block mb-1">Address:</span>
                  <span className="font-mono text-xs break-all">
                    {account.address}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Available Wallets */}
          <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
            <h2 className="text-lg font-semibold mb-4">Available Wallets</h2>
            <div className="space-y-2">
              {!mounted ? (
                <p className="text-zinc-500 text-sm">Loading wallets...</p>
              ) : wallets.length === 0 ? (
                <p className="text-zinc-500 text-sm">No wallets detected</p>
              ) : (
                wallets.map((wallet) => (
                  <div
                    key={wallet.name}
                    className="flex items-center gap-2 text-sm p-2 bg-zinc-800 rounded"
                  >
                    {wallet.icon && (
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-5 h-5"
                      />
                    )}
                    <span>{wallet.name}</span>
                    {(wallet.name.toLowerCase().includes("google") ||
                      wallet.name.toLowerCase().includes("enoki")) && (
                      <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">
                        zkLogin
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            {!account ? (
              <button
                onClick={handleConnectZkLogin}
                disabled={isConnecting || !zkLoginWallet}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors"
              >
                {isConnecting
                  ? "Connecting..."
                  : "Connect with zkLogin (Google)"}
              </button>
            ) : (
              <>
                <button
                  onClick={handleCheckBalance}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                >
                  Check Balance
                </button>
                <button
                  onClick={handleSponsoredTransaction}
                  disabled={isSponsoredPending || isLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors"
                >
                  {isSponsoredPending || isLoading
                    ? "Processing..."
                    : "Send Sponsored TX"}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>

          {mounted && !zkLoginWallet && (
            <div className="mt-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-sm">
              <p className="text-yellow-400 font-medium">
                zkLogin not configured
              </p>
              <p className="text-yellow-200/70 mt-1">
                Set these in{" "}
                <code className="bg-zinc-800 px-1 rounded">.env.local</code>:
              </p>
              <pre className="mt-2 text-xs bg-zinc-800 p-2 rounded overflow-x-auto">
                {`NEXT_PUBLIC_ENOKI_PUBLIC_KEY=enoki_public_xxx
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com`}
              </pre>
            </div>
          )}
        </div>

        {/* Keypair Derivation Test */}
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">
            Keypair Derivation Test
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Test that zkLogin derives the same encryption keypair every time.
            This is critical for encrypted chat - users must get the same keys
            to decrypt messages.
          </p>

          {derivedKeypair && (
            <div className="mb-4 p-3 bg-zinc-800 rounded-lg space-y-2">
              <div>
                <p className="text-xs text-zinc-400 mb-1">
                  Derived Public Key:
                </p>
                <p className="font-mono text-xs text-green-400 break-all">
                  {derivedKeypair.publicKey}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-1">
                  Derived Secret Key:
                </p>
                <p className="font-mono text-xs text-yellow-400 break-all">
                  {derivedKeypair.secretKey}
                </p>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Derivation count: {derivationCount}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDeriveKeypair}
              disabled={!account || !isZkLogin || isLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors"
            >
              {isLoading
                ? "Deriving..."
                : derivedKeypair
                ? "Derive Again (Should Match)"
                : "Derive Keypair"}
            </button>
            {derivedKeypair && (
              <button
                onClick={handleResetDerivation}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {!isZkLogin && account && (
            <p className="mt-3 text-sm text-yellow-400">
              Connect with zkLogin (Google) to test keypair derivation.
            </p>
          )}

          {/* Manual JWT Input */}
          <div className="mt-4 p-3 bg-zinc-800 rounded-lg">
            <button
              onClick={() => setShowJwtInput(!showJwtInput)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {showJwtInput ? "▼ Hide" : "▶ Show"} Manual JWT Input (Debug)
            </button>
            {showJwtInput && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">
                  If automatic JWT detection fails, paste your Google ID token
                  here:
                </p>
                <textarea
                  value={manualJwt}
                  onChange={(e) => setManualJwt(e.target.value)}
                  placeholder="eyJhbGciOiJSUzI1NiIs..."
                  className="w-full h-20 p-2 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-zinc-300 placeholder-zinc-600"
                />
                <p className="text-xs text-zinc-500">
                  Get this from browser DevTools &gt; Network tab when logging
                  in with Google, or check the auth/callback page console logs.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-zinc-800 rounded-lg text-xs text-zinc-400">
            <p className="font-medium text-zinc-300 mb-2">How to test:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Connect with zkLogin (Google)</li>
              <li>Click &quot;Derive Keypair&quot; - note the public key</li>
              <li>
                Click &quot;Derive Again&quot; - should show &quot;MATCH!&quot;
              </li>
              <li>Disconnect, reconnect, derive again - should still match</li>
              <li>If keys ever mismatch, the encryption system has a bug</li>
            </ol>
          </div>
        </div>

        {/* Logs */}
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Logs</h2>
            <button
              onClick={clearLogs}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              Clear
            </button>
          </div>
          <div className="bg-black rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-zinc-600">No logs yet...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">
                  <span className="text-zinc-500">[{log.time}]</span>{" "}
                  <span
                    className={
                      log.type === "success"
                        ? "text-green-400"
                        : log.type === "error"
                        ? "text-red-400"
                        : log.type === "warning"
                        ? "text-yellow-400"
                        : "text-zinc-300"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">Test Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-300">
            <li>
              Click &quot;Connect with zkLogin (Google)&quot; to authenticate
            </li>
            <li>Complete Google OAuth flow in the popup</li>
            <li>
              Once connected, click &quot;Check Balance&quot; to verify
              connection
            </li>
            <li>
              Click &quot;Send Sponsored TX&quot; to test sponsored transaction
            </li>
            <li>Check logs for transaction digest and explorer link</li>
          </ol>

          <div className="mt-4 p-4 bg-zinc-800 rounded-lg text-sm">
            <p className="text-zinc-400">
              <strong>Note:</strong> Sponsored transactions require{" "}
              <code className="bg-zinc-700 px-1 rounded">
                ENOKI_PRIVATE_KEY
              </code>{" "}
              configured on the backend.
            </p>
          </div>
        </div>

        {/* Back link */}
        <div>
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
