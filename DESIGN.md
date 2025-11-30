# Sui Chat - Design Document

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [User Flows](#user-flows)
4. [UI/UX Design](#uiux-design)
5. [Technical Design](#technical-design)
6. [Data Structures](#data-structures)
7. [Security & Encryption](#security--encryption)
8. [On-chain vs Off-chain](#on-chain-vs-off-chain)
9. [Component Structure](#component-structure)
10. [API & Contract Interactions](#api--contract-interactions)

---

## Overview

Sui Chat is a decentralized chat application built on the Sui blockchain. It enables public and private group chats with on-chain message storage, encrypted private communications, and integrated payment functionality.

### Key Features
- **User Registration**: On-chain user profiles as soul-bound NFTs
- **Public Chat Rooms**: Open to all users, messages stored on-chain
- **Private Chat Rooms**: Invitation-only with encrypted messages
- **Message Types**: Text, emoji, images, files, and SUI tips
- **Access Control**: Pass-based system for private rooms, ban management
- **On-chain Storage**: Messages, images, and files stored on Sui blockchain

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Register   │  │  Chat List   │  │  Chat Room   │     │
│  │   Interface  │  │  Interface   │  │  Interface   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   User List  │  │  Pass Mgmt   │  │  Encryption   │     │
│  │  Interface   │  │  Interface   │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ @mysten/dapp-kit
                            │ @mysten/sui
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Sui Blockchain                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  User Module │  │  Chat Module │  │ Message Mod. │     │
│  │  (user.move) │  │ (chat.move)  │  │(message.move)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐                                            │
│  │  Pass Module │                                            │
│  │ (pass.move)  │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 16 (React 19)
- TypeScript
- Tailwind CSS
- @mysten/dapp-kit (Sui wallet integration)
- @mysten/sui (Sui client)
- @tanstack/react-query (data fetching)

**Backend:**
- Sui Move smart contracts
- On-chain storage via Dynamic Object Fields

**Encryption:**
- libsodium-wrappers (for end-to-end encryption in private chats)

---

## User Flows

### 1. Registration Flow

```
User connects wallet
    ↓
Check if User object exists for address
    ↓
If not registered:
    ├─ Display registration form
    │  ├─ Name (required)
    │  ├─ Portrait URL (optional)
    │  ├─ Generate encryption key pair
    │  └─ Treasury address (defaults to wallet address)
    ↓
Call create_user() on-chain
    ↓
Store encryption private key locally (encrypted)
    ↓
Redirect to Chat Room List
```

### 2. Chat Room List Flow

```
Load user's registered status
    ↓
If not registered → Redirect to Registration
    ↓
Fetch all Chat objects from chain
    ├─ Public chats (is_private = false)
    └─ Private chats (is_private = true)
        └─ Filter: User has Pass for this chat
    ↓
Display chat rooms:
    ├─ Public rooms: Show name, host, member count
    └─ Private rooms: Show name, host, "Private" badge
    ↓
User selects a room
    ↓
Check if user is banned
    ↓
If banned → Show error, prevent joining
    ↓
If not banned:
    ├─ Public: Call join_public_chat()
    └─ Private: Verify Pass exists → Call join_private_chat()
    ↓
Navigate to Chat Room Interface
```

### 3. Creating a Chat Room

```
User clicks "Create Room"
    ↓
Display form:
    ├─ Room name
    ├─ Room type (Public/Private)
    └─ If Private: Generate encryption key
    ↓
If Public:
    └─ Call create_public_chat()
If Private:
    ├─ Generate symmetric encryption key
    ├─ Encrypt key with each invitee's public key
    ├─ Create Pass for each invitee
    ├─ Call create_private_chat() with encrypted key
    └─ Transfer Passes to invitees
    ↓
Navigate to new Chat Room
```

### 4. Sending Messages Flow

```
User types message / selects file / selects emoji
    ↓
If Private Room:
    ├─ Encrypt message content with room's encryption key
    └─ Store encrypted content on-chain
If Public Room:
    └─ Store plaintext content on-chain
    ↓
If sending tip:
    ├─ User approves SUI transfer
    └─ Include tip amount in transaction
    ↓
Call create_message() or create_message_with_tip()
    ↓
Message stored as Dynamic Object Field on Chat
    ↓
UI updates with new message
```

### 5. Private Room Invitation Flow

```
User (host) wants to invite someone
    ↓
Display invitation form:
    ├─ Select user from User List
    └─ Generate/retrieve room encryption key
    ↓
Encrypt room key with invitee's public key
    ↓
Create Pass object with encrypted key
    ↓
Transfer Pass to invitee's address
    ↓
Invitee receives Pass in wallet
    ↓
Invitee sees private room in Chat Room List
    ↓
Invitee can join using Pass
```

### 6. File/Image Upload Flow

```
User selects file/image
    ↓
If Private Room:
    ├─ Encrypt file content
    └─ Upload encrypted file to IPFS/decentralized storage
If Public Room:
    └─ Upload file to IPFS/decentralized storage
    ↓
Get file URL/hash
    ↓
Create message with file_url or image_url
    ↓
Store message on-chain
```

---

## UI/UX Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Sui Chat Logo | Wallet Connect | User Profile     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌────────────────────────────────────┐ │
│  │              │  │                                    │ │
│  │  Chat Room   │  │      Chat Room Interface          │ │
│  │     List     │  │                                    │ │
│  │              │  │  ┌────────────────────────────┐  │ │
│  │  • Public 1  │  │  │  Message Area (scrollable)  │  │ │
│  │  • Public 2  │  │  │                            │  │ │
│  │  • Private 1 │  │  │  [Messages appear here]    │  │ │
│  │  • Private 2 │  │  │                            │  │ │
│  │              │  │  └────────────────────────────┘  │ │
│  │  [+ Create]  │  │                                    │ │
│  │              │  │  ┌────────────────────────────┐  │ │
│  │              │  │  │  Input Area                │  │ │
│  │              │  │  │  [Text] [😀] [📎] [💰] [Send]│  │ │
│  │              │  │  └────────────────────────────┘  │ │
│  └──────────────┘  └────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────┐                                           │
│  │  User List   │                                           │
│  │  (Sidebar)   │                                           │
│  │              │                                           │
│  │  • User 1    │                                           │
│  │  • User 2    │                                           │
│  │  • User 3    │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Interfaces

#### 1. Registration Interface
- **Form Fields:**
  - Display Name (text input, max 100 chars)
  - Portrait URL (text input, optional, max 500 chars)
  - Treasury Address (address input, defaults to wallet address)
- **Actions:**
  - "Register" button (calls `create_user()`)
  - "Cancel" button (returns to home)
- **Validation:**
  - Name required, non-empty
  - Auto-generate encryption key pair
  - Show wallet connection status

#### 2. Chat Room List Interface
- **Layout:** Grid or list view
- **Room Card Components:**
  - Room name
  - Host name/address
  - Room type badge (Public/Private)
  - Member count
  - Last message preview (if available)
  - Join button
- **Filters:**
  - Show all / Public only / Private only
  - Search by name
- **Actions:**
  - "Create Room" button (opens creation modal)
  - Click room card → Navigate to room

#### 3. Chat Room Interface
- **Header:**
  - Room name
  - Member count
  - Settings button (if host)
  - Leave room button
- **Message Area:**
  - Scrollable message list
  - Message bubbles (sender on right, others on left)
  - Timestamp display
  - File/image previews
  - Tip amount display (if applicable)
- **Input Area:**
  - Text input field
  - Emoji picker button
  - File upload button
  - Image upload button
  - Tip amount input (optional)
  - Send button
- **Features:**
  - Real-time message updates (polling or subscription)
  - Message encryption indicator (for private rooms)
  - Typing indicators (future enhancement)

#### 4. User List Interface
- **Display:**
  - User cards with:
    - Portrait image
    - Display name
    - Wallet address (truncated)
  - Search/filter functionality
- **Actions:**
  - Click user → View profile
  - If in private room → "Invite" button
  - If host → "Ban/Unban" options

---

## Technical Design

### State Management

**Global State:**
- Current user (User object from chain)
- Connected wallet address
- Encryption keys (stored in encrypted localStorage)

**Room State:**
- Current room (Chat object)
- Messages (fetched from chain)
- Members list
- User's membership status

**UI State:**
- Active view (list/room/profile)
- Loading states
- Error messages

### Data Fetching Strategy

**Initial Load:**
1. Fetch User object for connected address
2. Fetch all Chat objects (public + private with Pass)
3. Fetch messages for active room (paginated)

**Real-time Updates:**
- Polling: Refresh messages every 5-10 seconds
- Event subscription: Listen to Sui events for new messages
- Optimistic updates: Show message immediately, confirm on-chain

**Pagination:**
- Messages: Load in batches (e.g., 50 at a time)
- Chat rooms: Load all (or implement pagination if needed)
- Use `message_count` to determine total messages

### Encryption Flow (Private Rooms)

```
1. Room Creation:
   ├─ Generate symmetric encryption key (AES-256)
   ├─ Encrypt key with each member's public key (RSA/ECIES)
   └─ Store encrypted keys in Pass objects

2. Message Sending:
   ├─ Encrypt message content with room's symmetric key
   ├─ Store encrypted content on-chain
   └─ Decrypt on client-side when displaying

3. File/Image Sending:
   ├─ Encrypt file content with room's symmetric key
   ├─ Upload encrypted file to IPFS
   ├─ Store IPFS hash on-chain
   └─ Decrypt and display on client-side
```

### File Storage Strategy

**Option 1: IPFS (Recommended)**
- Upload files to IPFS
- Store IPFS hash in message's `image_url` or `file_url`
- Use IPFS gateway for retrieval

**Option 2: On-chain Storage**
- Store small files directly in message (limited by transaction size)
- Not recommended for large files

**Option 3: Hybrid**
- Small files (< 100KB): On-chain
- Large files: IPFS

---

## Data Structures

### Frontend Data Models

```typescript
interface User {
  id: string; // Object ID
  name: string;
  portraitUrl: string;
  encryptionPublicKey: string;
  treasury: string; // Address
  address: string; // Wallet address
}

interface ChatRoom {
  id: string; // Object ID
  name: string;
  host: string; // User ID
  isPrivate: boolean;
  messageCount: number;
  encryptedMessageKey?: string; // For private rooms
}

interface Message {
  id: string; // Object ID
  chatId: string;
  text: string; // Encrypted for private rooms
  sender: string; // User ID
  timestamp: number; // Unix timestamp in ms
  tippedAmount: number; // In MIST
  imageUrl: string;
  fileUrl?: string; // For file attachments
  isEncrypted: boolean; // Frontend flag
}

interface Pass {
  id: string; // Object ID
  chatId: string;
  encryptedMessageKey: string;
  createdAt: number;
}

interface ChatMember {
  userId: string;
  joinedAt: number;
  isMuted: boolean;
}
```

### On-chain Data Structures

**User (user.move):**
- `id: UID`
- `name: String`
- `portrait_url: String`
- `encryption_public_key: String`
- `treasury: address`

**Chat (chat.move):**
- `id: UID`
- `name: String`
- `host: ID`
- `is_private: bool`
- `encrypted_message_key: Option<String>`
- `message_count: u64`

**Message (message.move):**
- `id: UID`
- `chat: ID`
- `text: String`
- `sender: ID`
- `timestamp: u64`
- `tipped_amount: u64`
- `image_url: String`

**Pass (pass.move):**
- `id: UID`
- `chat: ID`
- `encrypted_message_key: String`
- `created_at: u64`

---

## Security & Encryption

### Encryption Architecture

**Key Management:**
- Each user generates an encryption key pair on registration
- Private key stored in encrypted localStorage (encrypted with wallet signature)
- Public key stored on-chain in User object

**Private Room Encryption:**
- Symmetric encryption key (AES-256) per room
- Key encrypted with each member's public key
- Stored in Pass objects
- Messages encrypted with symmetric key before on-chain storage

**Encryption Library:**
- Use `libsodium-wrappers` for encryption operations
- Implement end-to-end encryption for private rooms
- Ensure keys never leave client unencrypted

### Access Control

**Public Rooms:**
- Anyone can join
- Host can ban users
- Banned users cannot rejoin

**Private Rooms:**
- Require Pass to join
- Pass ownership verified on-chain
- Only members can decrypt messages

**Ban Management:**
- Host can ban/unban users
- Ban stored as Dynamic Object Field on Chat
- Checked before allowing join/message creation

### Security Best Practices

1. **Never store private keys in plaintext**
2. **Validate all on-chain data before displaying**
3. **Sanitize user inputs before sending to chain**
4. **Use HTTPS for all network requests**
5. **Implement rate limiting for message creation**
6. **Verify message signatures/ownership**

---

## On-chain vs Off-chain

### On-chain Storage

**Stored On-chain:**
- User profiles (User objects)
- Chat room metadata (Chat objects)
- Messages (Message objects as DOF)
- Pass objects (for private room access)
- Member lists (ChatMember as DOF)
- Ban lists (BlacklistKey as DOF)

**Benefits:**
- Decentralized and censorship-resistant
- Immutable message history
- No single point of failure
- Transparent and verifiable

**Limitations:**
- Transaction costs per message
- Storage costs
- Slower than traditional databases
- Limited file size in transactions

### Off-chain Storage

**Stored Off-chain:**
- Encryption private keys (encrypted localStorage)
- UI state and preferences
- Cached message data (for performance)
- File content (IPFS or similar)

**Hybrid Approach:**
- Metadata on-chain (message text, sender, timestamp)
- Large files on IPFS (hash stored on-chain)
- Encryption keys managed client-side

---

## Component Structure

### Directory Structure

```
chat-web/src/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                 # Home/landing page
│   ├── register/
│   │   └── page.tsx            # Registration interface
│   ├── rooms/
│   │   ├── page.tsx            # Chat room list
│   │   └── [id]/
│   │       └── page.tsx        # Individual chat room
│   └── providers.tsx           # Sui/Query providers
├── components/
│   ├── chat/
│   │   ├── ChatRoomList.tsx
│   │   ├── ChatRoom.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   └── MessageInput.tsx
│   ├── user/
│   │   ├── UserList.tsx
│   │   ├── UserCard.tsx
│   │   └── UserProfile.tsx
│   ├── room/
│   │   ├── RoomCard.tsx
│   │   ├── CreateRoomModal.tsx
│   │   └── RoomSettings.tsx
│   └── common/
│       ├── Header.tsx
│       ├── LoadingSpinner.tsx
│       └── ErrorMessage.tsx
├── lib/
│   ├── crypto.ts               # Encryption utilities
│   ├── sui/
│   │   ├── client.ts          # Sui client setup
│   │   ├── user.ts            # User contract calls
│   │   ├── chat.ts            # Chat contract calls
│   │   ├── message.ts         # Message contract calls
│   │   └── pass.ts            # Pass contract calls
│   └── ipfs.ts                # IPFS integration (if used)
└── hooks/
    ├── useUser.ts             # User data hook
    ├── useChatRooms.ts        # Chat rooms hook
    ├── useMessages.ts        # Messages hook
    └── useEncryption.ts      # Encryption utilities hook
```

### Key Components

**ChatRoomList:**
- Fetches all chat rooms
- Filters by type (public/private)
- Displays room cards
- Handles room creation

**ChatRoom:**
- Fetches messages for room
- Displays message list
- Handles message sending
- Manages member list
- Handles file/image uploads

**MessageBubble:**
- Displays message content
- Shows sender info
- Handles decryption (if private)
- Displays file/image previews
- Shows tip amount

**MessageInput:**
- Text input
- Emoji picker
- File/image upload
- Tip amount input
- Send button

---

## API & Contract Interactions

### Contract Function Calls

#### User Module

```typescript
// Create user
create_user(
  name: string,
  portrait_url: string,
  encryption_public_key: string,
  treasury: address
)

// Get user by address
get_user_by_address(address: address): Option<User>
```

#### Chat Module

```typescript
// Create public chat
create_public_chat(name: string)

// Create private chat
create_private_chat(
  name: string,
  encrypted_message_key: string
)

// Join public chat
join_public_chat(chat_id: ID)

// Join private chat
join_private_chat(chat_id: ID, pass: Pass)

// Create message
create_message(
  chat_id: ID,
  text: string,
  image_url: string
)

// Create message with tip
create_message_with_tip(
  chat_id: ID,
  text: string,
  image_url: string,
  tip_coin: Coin<SUI>
)

// Ban user
ban_user(chat_id: ID, user_id: ID)

// Unban user
unban_user(chat_id: ID, user_id: ID)
```

#### Pass Module

```typescript
// Create pass
create_pass(
  chat: ID,
  encrypted_message_key: string
)

// Get pass for chat
get_pass_by_chat(chat_id: ID): Option<Pass>
```

### Query Functions

```typescript
// Get all chat rooms
getAllChatRooms(): ChatRoom[]

// Get messages for chat
getMessages(chatId: string, limit?: number, cursor?: string): Message[]

// Get chat members
getChatMembers(chatId: string): ChatMember[]

// Get user's passes
getUserPasses(address: string): Pass[]

// Check if user is banned
isUserBanned(chatId: string, userId: string): boolean
```

### Event Listening

```typescript
// Listen for new messages
suiClient.subscribeEvent({
  filter: {
    Package: PACKAGE_ID,
    Module: 'chat',
    EventType: 'MessageCreated'
  },
  onMessage: (event) => {
    // Handle new message
  }
})
```

---

## Future Enhancements

1. **Real-time Updates**: WebSocket/Event subscription for instant message delivery
2. **Message Reactions**: Emoji reactions to messages
3. **Message Editing/Deletion**: Allow message modification (with on-chain updates)
4. **Voice/Video**: Integration with WebRTC for voice/video calls
5. **Notifications**: Browser notifications for new messages
6. **Message Search**: Full-text search across messages
7. **Message Pinning**: Pin important messages
8. **Read Receipts**: Track message read status
9. **Typing Indicators**: Show when users are typing
10. **Multi-chain Support**: Support for other blockchains

---

## Implementation Notes

### Development Phases

**Phase 1: Core Functionality**
- User registration
- Public chat creation and joining
- Message sending (text only)
- Basic UI

**Phase 2: Private Chats**
- Private room creation
- Pass generation and distribution
- Message encryption
- Private room joining

**Phase 3: Enhanced Features**
- File/image uploads
- Tips/payments
- Emoji support
- Ban management

**Phase 4: Polish**
- UI/UX improvements
- Performance optimization
- Error handling
- Testing

### Testing Strategy

- Unit tests for encryption/decryption
- Integration tests for contract calls
- E2E tests for user flows
- Performance testing for message loading
- Security audits for encryption implementation

---

## Conclusion

This design document outlines a comprehensive decentralized chat application leveraging Sui blockchain for on-chain storage and access control, with client-side encryption for private communications. The architecture balances decentralization with user experience, ensuring security, privacy, and functionality.

