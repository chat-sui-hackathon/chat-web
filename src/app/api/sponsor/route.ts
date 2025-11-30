import { NextRequest, NextResponse } from 'next/server'

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
 * Sponsor Transaction API - Step 1: Get Sponsorship
 *
 * 流程：
 * 1. 前端建立 transaction kind bytes
 * 2. 傳到這個 API
 * 3. 這個 API 呼叫 Enoki 進行 sponsorship
 * 4. 返回 sponsored tx bytes + sponsor signature 給前端
 * 5. 前端簽名後呼叫 /api/sponsor/execute
 */
export async function POST(request: NextRequest) {
  try {
    if (!ENOKI_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'ENOKI_PRIVATE_KEY not configured' },
        { status: 500 }
      )
    }

    const { txBytes, sender } = await request.json()

    if (!txBytes) {
      return NextResponse.json(
        { error: 'Missing txBytes' },
        { status: 400 }
      )
    }

    if (!sender) {
      return NextResponse.json(
        { error: 'Missing sender address' },
        { status: 400 }
      )
    }

    // 呼叫 Enoki API 進行 sponsorship
    const sponsorRes = await fetch(`${ENOKI_API_URL}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENOKI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: NETWORK,
        transactionBlockKindBytes: txBytes,
        sender,
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

    const sponsorRes_json = await sponsorRes.json()

    // Debug: log Enoki response
    console.log('Enoki sponsor response:', JSON.stringify(sponsorRes_json, null, 2))

    // Enoki 回應格式: { data: { digest, bytes } }
    const sponsorData = sponsorRes_json.data || sponsorRes_json

    if (!sponsorData.bytes) {
      return NextResponse.json(
        { error: 'Invalid sponsor response', details: JSON.stringify(sponsorRes_json) },
        { status: 500 }
      )
    }

    // 返回 sponsored tx bytes 和 sponsor signature
    // 注意：Enoki sponsor API 不返回 signature，signature 會在 execute 時由 Enoki 提供
    // 或者我們需要用不同的 API flow
    return NextResponse.json({
      txBytes: sponsorData.bytes,
      digest: sponsorData.digest,
    })
  } catch (error) {
    console.error('Sponsor API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
