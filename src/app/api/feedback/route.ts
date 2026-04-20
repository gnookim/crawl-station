// GET/POST /api/feedback
// @orch-std: feedback-api v2.1.0
// APP_NAME은 앱별로 변경

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const APP_NAME = 'crawl-station'
const SSO_URL = process.env.NEXT_PUBLIC_SSO_URL ?? 'https://lifenbio-sso.fly.dev'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// SSO에서 user_id로 현재 이름 조회 — 이름 변경 시 자동 반영
async function resolveUserName(userId: string, fallback: string | null): Promise<string | null> {
  try {
    const res = await fetch(`${SSO_URL}/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.SSO_JWT_SECRET ?? ''}` },
      next: { revalidate: 60 },
    })
    if (res.ok) {
      const u = await res.json()
      return u?.name ?? u?.username ?? fallback
    }
  } catch {}
  return fallback
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  if (searchParams.get('count') === 'true') {
    const { count } = await db()
      .from('orch_issues')
      .select('*', { count: 'exact', head: true })
      .eq('service_name', APP_NAME)
      .in('status', ['pending', 'in_progress', 'resolved'])
    return NextResponse.json({ unresolved: count ?? 0 })
  }

  let q = db()
    .from('orch_issues')
    .select('*')
    .eq('service_name', APP_NAME)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // user_id가 있는 항목은 SSO에서 현재 이름 조회
  const resolved = await Promise.all(
    (data ?? []).map(async (item) => {
      if (item.user_id) {
        const currentName = await resolveUserName(item.user_id, item.submitted_by)
        return { ...item, submitted_by: currentName }
      }
      return item
    })
  )

  return NextResponse.json(resolved)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, priority, title, description, submitted_by, user_id, image_urls } = body
  if (!title) return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })
  if (!description) return NextResponse.json({ error: '설명은 필수입니다' }, { status: 400 })

  const { data, error } = await db().from('orch_issues').insert({
    service_name: APP_NAME,
    type: type ?? 'feature',
    priority: priority ?? 'medium',
    title,
    description,
    submitted_by: submitted_by ?? null,
    user_id: user_id ?? null,
    image_urls: image_urls ?? [],
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
