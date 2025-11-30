import { NextRequest, NextResponse } from 'next/server'

const ENOKI_API_URL = 'https://api.enoki.mystenlabs.com/v1'
const ENOKI_PRIVATE_KEY = process.env.ENOKI_PRIVATE_KEY

/**
 * Get user salt from Enoki
 *
 * userSalt 是 Enoki 為每個用戶產生的獨特值，
 * 用於 zkLogin address 計算和加密金鑰派生
 */
export async function POST(request: NextRequest) {
  try {
    if (!ENOKI_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'ENOKI_PRIVATE_KEY not configured' },
        { status: 500 }
      )
    }

    const { jwt } = await request.json()

    if (!jwt) {
      return NextResponse.json(
        { error: 'Missing jwt' },
        { status: 400 }
      )
    }

    // 呼叫 Enoki API 取得 userSalt
    const saltRes = await fetch(`${ENOKI_API_URL}/zklogin`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ENOKI_PRIVATE_KEY}`,
        'zklogin-jwt': jwt,
      },
    })

    if (!saltRes.ok) {
      const errorText = await saltRes.text()
      console.error('Enoki salt error:', errorText)
      return NextResponse.json(
        { error: 'Failed to get user salt', details: errorText },
        { status: saltRes.status }
      )
    }

    const saltData = await saltRes.json()
    console.log('Enoki salt response:', JSON.stringify(saltData, null, 2))

    // Enoki 回應格式: { data: { salt, address } }
    const data = saltData.data || saltData

    return NextResponse.json({
      userSalt: data.salt,
      address: data.address,
    })
  } catch (error) {
    console.error('Salt API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
