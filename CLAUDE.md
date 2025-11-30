# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sui Chat 是一個去中心化聊天應用，建構在 Sui 區塊鏈上。無中心化後端，所有資料存儲於鏈上或 Walrus 去中心化儲存。

## Commands

```bash
npm run dev       # Start development server (localhost:3000)
npm run build     # Build for production
npm run lint      # Run ESLint
npm run test      # Run tests with Vitest (watch mode)
npm run test:run  # Run tests once
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Blockchain**: Sui via @mysten/dapp-kit and @mysten/sui
- **State**: React Query (TanStack Query) for async state
- **Crypto**: libsodium-wrappers for end-to-end encryption
- **Styling**: Tailwind CSS 4
- **Storage**: Walrus (for images/files)

## Key Documents

- `SMART_CONTRACT_SPEC.md` - 智能合約完整規格

## Architecture

### Provider Setup (`src/app/providers.tsx`)

Client component wrapping the app with Sui wallet and React Query:
- `SuiClientProvider` - Supports localnet, devnet, testnet, mainnet
- `WalletProvider` - Auto-connect enabled
- `QueryClientProvider` - 10s stale time, no refetch on focus

### Crypto Module (`src/lib/crypto.ts`)

End-to-end encryption using X25519 + XSalsa20-Poly1305:

**Initialization**: Must call `initCrypto()` before using any crypto functions.

**Key Derivation**:
```
signPersonalMessage("sui-chat:derive-encryption-key:v1")
  → BLAKE2b(signature) → 32 bytes seed
  → X25519 keypair
```

**Key Functions**:
- `deriveEncryptionKeypair(signature)` - Derive X25519 keypair from wallet signature
- `encryptWithPublicKey/decryptWithSecretKey` - Sealed Box for key exchange (output = input + 48 bytes)
- `encryptMessage/decryptMessage` - Symmetric XSalsa20-Poly1305, returns base64

**Message Format**: `base64(version[1] + nonce[24] + ciphertext)`

**Security**:
- secretKey 只存 memory，不存 localStorage
- 切換帳號時清除所有快取

### zkLogin Module (`src/lib/zklogin.ts`)

Utilities for working with Enoki zkLogin:

**JWT Utilities**:
- `decodeJwtPayload(jwt)` - Decode JWT payload (no verification)
- `isJwtExpired(jwt)` - Check if JWT is expired

**Enoki Session**:
- `getJwtFromWallet(wallet)` - Get JWT from connected Enoki wallet
- `getZkLoginSessionData(wallet)` - Get full session data (jwt, sub, iss, aud)

**User Salt**:
- `fetchUserSalt(jwt)` - Fetch userSalt from `/api/zklogin/salt` endpoint

### Hooks (`src/hooks/`)

**useZkLoginKeypair** - Derive encryption keypair from zkLogin session:
```typescript
const {
  keypair,           // Keypair | null - The derived X25519 keypair
  publicKeyBase64,   // string | null - Base64 encoded public key
  isLoading,         // boolean
  error,             // Error | null
  derive,            // () => Promise<{ keypair, publicKeyBase64 } | null>
  clear,             // () => void
  isZkLogin,         // boolean - Whether connected via zkLogin
} = useZkLoginKeypair({
  autoDerive: false,  // Auto-derive on connect
  onSuccess: (keypair) => {},
  onError: (error) => {},
})
```

**useSponsoredTransaction** - Execute sponsored transactions via Enoki:
```typescript
const { execute, isPending, error } = useSponsoredTransaction({
  onSuccess: (result) => {},
  onError: (error) => {},
})

// Usage
const tx = new Transaction()
tx.moveCall({ ... })
const result = await execute(tx)
```

**useAuthMethod** - Detect authentication method:
```typescript
const { authMethod, isZkLogin, isWallet } = useAuthMethod()
// authMethod: 'zkLogin' | 'wallet' | null
```

### zkLogin Key Derivation

For zkLogin users, keypair derivation uses stable JWT claims instead of wallet signature:

```
JWT claims (sub, iss, aud) + userSalt
  → HKDF-SHA256
  → 32 bytes seed
  → X25519 keypair
```

This ensures the same user always derives the same keypair across sessions.

### Sponsored Transactions

Flow for zero-balance zkLogin accounts:
1. Client builds transaction kind (no gas info)
2. Backend calls Enoki `/transaction-blocks/sponsor` → returns bytes + digest
3. Client signs the sponsored transaction
4. Backend calls Enoki `/transaction-blocks/sponsor/{digest}` with user signature

API Routes:
- `POST /api/sponsor` - Get sponsored transaction bytes
- `POST /api/sponsor/execute` - Execute with user signature
- `POST /api/zklogin/salt` - Get userSalt from Enoki

### Smart Contract Design (Sui Move)

Three modules: `config`, `profile`, `chat`

**Objects**:
- `AppConfig` (Shared) - Version control
- `AdminCap` (Owned) - Admin privileges
- `Profile` (Owned) - User identity with X25519 public key (32 bytes)
- `ProfileRegistry` (Shared) - Maps custom_id → address via Dynamic Fields
- `ChatRoom` (Shared) - Chat with members, messages via Dynamic Fields
- `UserChatIndex` (Shared) - User's chat list and blocked users

**Encrypted Chat Flow**:
1. Creator generates symmetric key, encrypts with own public key
2. Invitee receives key encrypted with their public key
3. Messages encrypted with symmetric key, stored on-chain

## Transaction Patterns

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";

const { mutate: signAndExecute } = useSignAndExecuteTransaction();

const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::chat::send_message`,
  arguments: [
    tx.object(APP_CONFIG_ID),
    tx.object(chatId),
    tx.pure.u8(contentType),
    tx.pure.string(content),
    tx.object("0x6"), // Clock
  ],
});

signAndExecute({ transaction: tx });
```

## Query Patterns

```typescript
import { SuiClient } from "@mysten/sui/client";

// Get owned objects
const { data } = await client.getOwnedObjects({
  owner: address,
  filter: { StructType: `${PACKAGE_ID}::profile::Profile` },
  options: { showContent: true },
});

// Get dynamic field (for messages, encrypted keys)
const field = await client.getDynamicFieldObject({
  parentId: chatRoomId,
  name: { type: "u64", value: messageIndex },
});
```

## Code Style

- TypeScript with strict mode
- Functional components, avoid classes
- Use `@/*` path alias for imports from `src/`
- Prefer React Server Components; use `'use client'` only for wallet/Web API access
- Named exports for components
- 2 space indentation, no semicolons (Standard.js style)

## Important Notes

1. **Clock Object**: Operations needing timestamp require Clock object (0x6)
2. **版本檢查**: 所有合約操作都需要傳入 AppConfig，合約內部會檢查版本
3. **Key Lengths**: X25519 keys = 32 bytes, Sealed Box overhead = 48 bytes, Nonce = 24 bytes
