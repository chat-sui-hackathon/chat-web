'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * OAuth callback 頁面
 * Google OAuth 會重定向到這裡，帶有 JWT 在 URL hash 中
 * Enoki wallet 會自動處理這個 callback
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Enoki 會自動處理 URL hash 中的 JWT
    // 我們只需要等待處理完成後重定向
    const timer = setTimeout(() => {
      // 檢查是否有錯誤
      const hash = window.location.hash
      if (hash.includes('error')) {
        setStatus('error')
        setError('登入失敗，請重試')
        return
      }

      setStatus('success')
      // 稍後重定向回首頁
      setTimeout(() => {
        router.push('/')
      }, 1000)
    }, 500)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <div className="mb-4 text-2xl">🔄</div>
            <p>正在處理登入...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="mb-4 text-2xl">✅</div>
            <p>登入成功！正在跳轉...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="mb-4 text-2xl">❌</div>
            <p className="text-red-500">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            >
              返回首頁
            </button>
          </>
        )}
      </div>
    </div>
  )
}
