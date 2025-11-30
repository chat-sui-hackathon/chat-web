# Sui Chat Smart Contract Specification

## Overview

去中心化聊天應用的 Sui Move 智能合約，支援公開與加密聊天室。無中心化後端，資料存鏈上或 Walrus。

---

## Module Structure

```
┌─────────────────────────────────────────┐
│                 config                   │
│           版本控制、管理員權限            │
└─────────────────────────────────────────┘
        ↓                     ↓
┌─────────────────┐   ┌─────────────────┐
│     profile     │   │      chat       │
│    使用者身份    │ ← │   聊天室與訊息   │
└─────────────────┘   └─────────────────┘
```

---

## Config Module

### Objects

**AppConfig (Shared Object)**

```move
struct AppConfig has key {
    id: UID,
    version: u64
}
```

**AdminCap (Owned Object)**

```move
struct AdminCap has key {
    id: UID
}
```

### Constants

- `VERSION: u64 = 1`
- `EWrongVersion: u64 = 1000`

### Functions

| Function        | Parameters                                               | Description                                                       |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `init`          | -                                                        | 建立 AppConfig (version=1) share，建立 AdminCap transfer 給發布者 |
| `set_version`   | `_: &AdminCap, config: &mut AppConfig, new_version: u64` | 更新版本                                                          |
| `check_version` | `config: &AppConfig`                                     | assert!(VERSION == config.version)                                |

---

## Profile Module

### Objects

**Profile (Owned Object)**

```move
struct Profile has key {
    id: UID,
    owner: address,
    custom_id: String,        // 唯一，不可修改
    display_name: String,
    avatar_blob_id: String,   // Walrus blob ID
    public_key: vector<u8>,   // X25519 公鑰，32 bytes
    chat_index_id: ID,        // 對應的 UserChatIndex
    created_at: u64
}
```

**ProfileRegistry (Shared Object)**

```move
struct ProfileRegistry has key {
    id: UID
    // Dynamic Field: String (custom_id) → address
}
```

### Constants

- `ECustomIdAlreadyExists: u64 = 2000`

### Functions

| Function         | Parameters                                                                                                                                                   | Description                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `create_profile` | `config: &AppConfig, registry: &mut ProfileRegistry, custom_id: String, display_name: String, avatar_blob_id: String, public_key: vector<u8>, clock: &Clock` | 建立 Profile 和 UserChatIndex    |
| `update_profile` | `config: &AppConfig, profile: &mut Profile, display_name: String, avatar_blob_id: String, public_key: vector<u8>`                                            | 更新 Profile（custom_id 不可改） |

### Query (Off-chain)

- **用地址找 Profile**: `getOwnedObjects` + filter by Profile type
- **用 custom_id 找**: `getDynamicFieldObject` 查 Registry → 取得 address → `getOwnedObjects`
- **找 UserChatIndex**: 從 Profile 讀 `chat_index_id` → `getObject`

---

## Chat Module

### Objects

**ChatRoom (Shared Object)**

```move
struct ChatRoom has key {
    id: UID,
    name: String,
    creator: address,
    is_encrypted: bool,
    members: VecSet<address>,
    message_count: u64,
    created_at: u64
    // Dynamic Field: u64 (message index) → Message
    // Dynamic Field: address → vector<u8> (encrypted symmetric key, 僅加密聊天室)
}
```

**Message (Struct)**

```move
struct Message has store, copy, drop {
    sender: address,
    content_type: u8,   // 0=文字, 1=圖片, 2=檔案
    content: String,    // 內容或 Walrus blob_id（加密聊天室為 base64(nonce + ciphertext)）
    timestamp: u64
}
```

**UserChatIndex (Shared Object)**

```move
struct UserChatIndex has key {
    id: UID,
    owner: address,
    chat_ids: vector<ID>,
    blocked: VecSet<address>
}
```

### Constants

- `ENotMember: u64 = 3000`
- `ENotOwner: u64 = 3001`
- `EAlreadyMember: u64 = 3002`
- `EBlocked: u64 = 3003`
- `ENotEncrypted: u64 = 3004`
- `EIsEncrypted: u64 = 3005`
- `EMissingEncryptedKey: u64 = 3006`

### Functions

| Function         | Parameters                                                                                                                               | Description        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `create_chat`    | `config: &AppConfig, user_index: &mut UserChatIndex, name: String, is_encrypted: bool, encrypted_key: Option<vector<u8>>, clock: &Clock` | 建立聊天室         |
| `join_chat`      | `config: &AppConfig, chat: &mut ChatRoom, user_index: &mut UserChatIndex`                                                                | 加入公開聊天室     |
| `invite_to_chat` | `config: &AppConfig, chat: &mut ChatRoom, invitee_index: &mut UserChatIndex, encrypted_key_for_invitee: vector<u8>`                      | 邀請加入加密聊天室 |
| `leave_chat`     | `config: &AppConfig, chat: &mut ChatRoom, user_index: &mut UserChatIndex`                                                                | 離開聊天室         |
| `send_message`   | `config: &AppConfig, chat: &mut ChatRoom, content_type: u8, content: String, clock: &Clock`                                              | 發送訊息           |
| `block_user`     | `config: &AppConfig, user_index: &mut UserChatIndex, target: address`                                                                    | 封鎖用戶           |
| `unblock_user`   | `config: &AppConfig, user_index: &mut UserChatIndex, target: address`                                                                    | 解除封鎖           |

### Events

```move
struct MessageSent has copy, drop {
    chat_id: ID,
    sender: address,
    message_index: u64,
    content_type: u8,
    timestamp: u64
}
```

### Query (Off-chain)

- **讀取訊息**: 用 `message_count` 配合 `getDynamicFieldObject` 批次讀取
- **讀取加密金鑰**: `getDynamicFieldObject` with key = user address

---

## Encryption Scheme

### Key Types

| Name         | Type      | Length        | Purpose    |
| ------------ | --------- | ------------- | ---------- |
| User Keypair | X25519    | 32 bytes each | 非對稱加密 |
| Chat Key     | Symmetric | 32 bytes      | 訊息加密   |

### Algorithms

| Purpose               | Algorithm                               |
| --------------------- | --------------------------------------- |
| Key Derivation        | SHA-256                                 |
| Asymmetric Encryption | X25519 + XSalsa20-Poly1305 (Sealed Box) |
| Symmetric Encryption  | XSalsa20-Poly1305                       |

### Frontend Crypto Functions

```typescript
type Keypair = {
  publicKey: Uint8Array; // 32 bytes
  secretKey: Uint8Array; // 32 bytes
};

// 對稱加密訊息
function encryptMessage(message: string, key: Uint8Array): string;

// 對稱解密訊息
function decryptMessage(
  encryptedMessage: string,
  key: Uint8Array
): string | null;

// 從錢包簽名衍生加密金鑰對
function deriveUserEncryptionKeypair(): Promise<Keypair>;

// 生成隨機對稱金鑰
function createRandomSymmetricKey(): Uint8Array;

// 用公鑰加密資料 (Sealed Box)
function encryptWithPublicKey(
  data: Uint8Array,
  publicKey: Uint8Array
): Uint8Array;

// 用私鑰解密資料 (Sealed Box)
function decryptWithSecretKey(
  encryptedData: Uint8Array,
  secretKey: Uint8Array
): Uint8Array | null;
```

### Encryption Flows

**Create Profile**

```
signPersonalMessage("sui-chat-encryption-v1:{address}")
  → SHA-256(signature)
  → X25519 keypair
  → Store publicKey on-chain
```

**Create Encrypted Chat**

```
symmetricKey = createRandomSymmetricKey()
encryptedKey = encryptWithPublicKey(symmetricKey, myPublicKey)
  → Store encryptedKey on-chain
```

**Invite Member**

```
symmetricKey = decryptWithSecretKey(myEncryptedKey, mySecretKey)
encryptedKeyForInvitee = encryptWithPublicKey(symmetricKey, inviteePublicKey)
  → Store encryptedKeyForInvitee on-chain
```

**Send Message**

```
encryptedContent = encryptMessage(plaintext, symmetricKey)
  → Store encryptedContent on-chain (format: base64(nonce + ciphertext))
```

**Read Message**

```
symmetricKey = decryptWithSecretKey(myEncryptedKey, mySecretKey)
plaintext = decryptMessage(encryptedContent, symmetricKey)
```

### Storage

| Data                      | Location                        | Notes                         |
| ------------------------- | ------------------------------- | ----------------------------- |
| X25519 publicKey          | On-chain Profile                | 32 bytes                      |
| X25519 secretKey          | Frontend memory                 | Never persist to localStorage |
| Encrypted symmetric key   | On-chain ChatRoom Dynamic Field | Per user                      |
| Symmetric key (decrypted) | Frontend memory cache           | Per chat room                 |
| Encrypted message         | On-chain Message.content        | base64(nonce + ciphertext)    |

---

## External Storage (Walrus)

大型檔案存放於 Walrus 去中心化儲存：

- 頭像圖片
- 聊天室內分享的圖片/檔案

鏈上僅存 `blob_id` 作為參照。

**Walrus API**

- 上傳: HTTP PUT
- 讀取: HTTP GET (免費)

---

## Version Control

所有操作需通過版本檢查：

```
AppConfig.version == Contract VERSION → 通過
AppConfig.version != Contract VERSION → 拒絕 (EWrongVersion)
```

升級流程：

1. 發布新版合約 (VERSION = 2)
2. AdminCap 呼叫 set_version 更新 AppConfig.version = 2
3. 舊合約失效，新合約生效

---

## Object IDs (To be filled after deployment)

```typescript
const CONTRACT = {
  PACKAGE_ID: "",
  APP_CONFIG_ID: "",
  PROFILE_REGISTRY_ID: "",
};
```
