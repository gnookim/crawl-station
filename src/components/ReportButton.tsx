'use client'
// @orch-std: report-button v2.1.0
// 복사 위치: src/components/ReportButton.tsx
// 사용: <ReportButton /> — 사이드바, 헤더, 에러 화면에 배치
// 설치: bash orchestrator/scripts/install-orch.sh

import { useState, useEffect } from 'react'

const APP_NAME = 'crawl-station'

type IssueType = 'bug' | 'feature' | 'improvement'
type Priority  = 'high' | 'medium' | 'low'

const TYPE_OPTIONS: { value: IssueType; label: string; icon: string }[] = [
  { value: 'bug',         label: '버그 신고',  icon: '🐛' },
  { value: 'feature',     label: '기능 요청',  icon: '💡' },
  { value: 'improvement', label: '개선 제안',  icon: '🔧' },
]

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'high',   label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low',    label: '낮음' },
]

export default function ReportButton() {
  const [open, setOpen]             = useState(false)
  const [type, setType]             = useState<IssueType>('bug')
  const [priority, setPriority]     = useState<Priority>('medium')
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [sending, setSending]       = useState(false)
  const [done, setDone]             = useState(false)
  const [userName, setUserName]     = useState('')
  const [userId, setUserId]         = useState<string | null>(null)

  useEffect(() => {
    async function loadUser() {
      try {
        const r = await fetch('/api/users/me')
        if (r.ok) { const u = await r.json(); if (u?.name) { setUserName(u.name); setUserId(u.id ?? null); return } }
      } catch {}
      try {
        const { getCurrentUser } = await import('@/lib/sso')
        const u = await getCurrentUser()
        if (u?.name) setUserName(u.name)
        if (u?.id)   setUserId(u.id)
      } catch {}
    }
    if (open) loadUser()
  }, [open])

  async function submit() {
    if (!title.trim()) return
    setSending(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          priority,
          title: title.trim(),
          description: description.trim() || title.trim(),
          submitted_by: userName || '익명',
          user_id: userId,
          image_urls: [],
        }),
      })
      setDone(true)
      setTimeout(() => { setOpen(false); setDone(false); setTitle(''); setDescription('') }, 1800)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background: 'transparent', border: '1px solid #374151', borderRadius: '8px',
          color: '#94a3b8', fontSize: '12px', padding: '6px 12px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px' }}>
        🐛 <span>오류 신고</span>
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '16px',
            padding: '24px', width: '420px', maxWidth: '90vw' }}>

            <div style={{ fontWeight: 600, marginBottom: '4px', color: '#f1f5f9', fontSize: '15px' }}>
              {done ? '✅ 접수됐습니다' : '오류 신고 · 기능 요청'}
            </div>
            {!done && (
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '16px' }}>
                {APP_NAME} · {userName || '로그인 필요'}
              </div>
            )}

            {!done && (
              <>
                {/* 타입 */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {TYPE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setType(opt.value)}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
                        background: type === opt.value ? '#6366f122' : '#1f2937',
                        border: `1px solid ${type === opt.value ? '#6366f1' : '#374151'}`,
                        color: type === opt.value ? '#818cf8' : '#94a3b8' }}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {/* 우선순위 */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {PRIORITY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPriority(opt.value)}
                      style={{ flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                        background: priority === opt.value ? '#f59e0b22' : '#1f2937',
                        border: `1px solid ${priority === opt.value ? '#f59e0b' : '#374151'}`,
                        color: priority === opt.value ? '#fbbf24' : '#6b7280' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* 제목 */}
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="무슨 문제인지 한 줄로"
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', marginBottom: '8px',
                    background: '#1f2937', border: '1px solid #374151', color: '#f1f5f9',
                    fontSize: '13px', boxSizing: 'border-box', outline: 'none' }} />

                {/* 설명 */}
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="상세 설명 (선택)"
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px',
                    background: '#1f2937', border: '1px solid #374151', color: '#f1f5f9',
                    fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setOpen(false)}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent',
                      border: '1px solid #374151', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>
                    취소
                  </button>
                  <button onClick={submit} disabled={sending || !title.trim()}
                    style={{ padding: '8px 20px', borderRadius: '8px', background: '#6366f1',
                      border: 'none', color: '#fff', cursor: 'pointer', fontSize: '13px',
                      opacity: (sending || !title.trim()) ? 0.5 : 1 }}>
                    {sending ? '전송 중...' : '접수'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
