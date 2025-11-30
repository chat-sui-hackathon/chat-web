import { NextRequest, NextResponse } from 'next/server'

const ENOKI_API_URL = 'https://api.enoki.mystenlabs.com/v1'
const ENOKI_PRIVATE_KEY = process.env.ENOKI_PRIVATE_KEY

/**
 * Execute Sponsored Transaction API
 *
 * 流程：
 * 1. 接收 digest + user signature
 * 2. 呼叫 Enoki execute API
 * 3. 返回執行結果
 */
export async function POST(request: NextRequest) {
  try {
    if (!ENOKI_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'ENOKI_PRIVATE_KEY not configured' },
        { status: 500 }
      )
    }

    const { digest, userSignature } = await request.json()

    if (!digest || !userSignature) {
      return NextResponse.json(
        { error: 'Missing digest or userSignature' },
        { status: 400 }
      )
    }

    // 呼叫 Enoki execute API
    const executeRes = await fetch(`${ENOKI_API_URL}/transaction-blocks/sponsor/${digest}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENOKI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signature: userSignature,
      }),
    })

    if (!executeRes.ok) {
      const errorText = await executeRes.text()
      console.error('Enoki execute error:', errorText)
      return NextResponse.json(
        { error: 'Failed to execute transaction', details: errorText },
        { status: executeRes.status }
      )
    }

    const executeData = await executeRes.json()
    console.log('Enoki execute response:', JSON.stringify(executeData, null, 2))

    // Enoki 回應格式: { data: { digest } }
    const result = executeData.data || executeData

    return NextResponse.json({
      success: true,
      digest: result.digest,
    })
  } catch (error) {
    console.error('Execute API error:', error)
    return NextResponse.json(
      { error: 'Failed to execute transaction', details: String(error) },
      { status: 500 }
    )
  }
}
