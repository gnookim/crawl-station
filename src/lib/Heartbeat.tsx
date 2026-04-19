'use client'
import { useEffect } from 'react'
import { orchHealth } from '@/lib/orch'

// layout.tsx에 <Heartbeat /> 한 줄 추가
// 앱이 살아있다는 신호를 5분마다 오케스트레이터에 전송
export default function Heartbeat() {
  useEffect(() => {
    orchHealth('ok')
    const id = setInterval(() => orchHealth('ok'), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return null
}
