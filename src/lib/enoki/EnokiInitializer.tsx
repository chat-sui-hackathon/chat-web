'use client'

import { useEffect } from 'react'
import { initEnokiWallets } from './config'

let initialized = false

/**
 * 在客戶端初始化 Enoki zkLogin 錢包
 * 只需要掛載一次
 */
export function EnokiInitializer() {
  useEffect(() => {
    if (!initialized) {
      initEnokiWallets()
      initialized = true
    }
  }, [])

  return null
}
