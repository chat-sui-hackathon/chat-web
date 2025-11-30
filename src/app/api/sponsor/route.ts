import { NextRequest, NextResponse } from 'next/server'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'

const ENOKI_API_URL = 'https://api.enoki.mystenlabs.com/v1'
const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet'
const ENOKI_PRIVATE_KEY = process.env.ENOKI_PRIVATE_KEY

// 允許的 Move call targets（安全白名單）
// 實際部署後填入正確的 PACKAGE_ID
const ALLOWED_TARGETS: string[] = [
  // `${process.env.NEXT_PUBLIC_PACKAGE_ID}::chat::send_message`,
  // `${process.env.NEXT_PUBLIC_PACKAGE_ID}::chat::create_chat`,
  // `${process.env.NEXT_PUBLIC_PACKAGE_ID}::profile::create_profile`,
]

/**
 * Sponsor Transaction API
 *
 * 流程（用戶先簽名版本）：
 * 1. 前端建立交易並用 ephemeral key 簽名
 * 2. 前端把「用戶簽名 + 交易」傳到這個 API
 * 3. 這個 API 呼叫 Enoki 進行 sponsorship
 * 4. Enoki 返回 sponsor 簽名
 * 5. 這個 API 用兩個簽名執行交易
 *
 * 安全性：
 * - 用戶先簽名，知道自己在簽什麼
 * - 後端只能加 gas，無法修改交易內容（否則用戶簽名會失效）
 */
export async function POST(request: NextRequest) {
  try {
    if (!ENOKI_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'ENOKI_PRIVATE_KEY not configured' },
        { status: 500 }
      )
    }

    const { txBytes, userSignature, jwt } = await request.json()

    if (!txBytes || !userSignature) {
      return NextResponse.json(
        { error: 'Missing txBytes or userSignature' },
        { status: 400 }
      )
    }

    // 1. 呼叫 Enoki API 進行 sponsorship
    const sponsorRes = await fetch(`${ENOKI_API_URL}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENOKI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        ...(jwt ? { 'zklogin-jwt': jwt } : {}),
      },
      body: JSON.stringify({
        network: NETWORK,
        transactionBlockKindBytes: txBytes,
        // 如果有設定白名單，可以限制只允許特定的 Move calls
        ...(ALLOWED_TARGETS.length > 0 ? { allowedMoveCallTargets: ALLOWED_TARGETS } : {}),
      }),
    })

    if (!sponsorRes.ok) {
      const errorText = await sponsorRes.text()
      console.error('Enoki sponsor error:', errorText)
      return NextResponse.json(
        { error: 'Failed to sponsor transaction', details: errorText },
        { status: sponsorRes.status }
      )
    }

    const sponsorData = await sponsorRes.json()
    const { digest, signature: sponsorSignature, txBytes: sponsoredTxBytes } = sponsorData

    // 2. 用兩個簽名執行交易
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK as 'testnet' | 'devnet' | 'mainnet') })

    const result = await client.executeTransactionBlock({
      transactionBlock: sponsoredTxBytes || txBytes,
      signature: [userSignature, sponsorSignature],
      options: {
        showEffects: true,
        showEvents: true,
      },
    })

    return NextResponse.json({
      success: true,
      digest: result.digest,
      effects: result.effects,
      events: result.events,
    })
  } catch (error) {
    console.error('Sponsor API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
