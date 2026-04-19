// GET/POST /api/feedback
// 복사 위치: src/app/api/feedback/route.ts
// APP_NAME은 앱별로 변경

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const APP_NAME = 'crawl-station'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status')

  if (new URL(req.url).searchParams.get('count') === 'true') {
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
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, priority, title, description, submitted_by, image_urls } = body
  if (!title) return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })
  if (!description) return NextResponse.json({ error: '설명은 필수입니다' }, { status: 400 })

  const { data, error } = await db().from('orch_issues').insert({
    service_name: APP_NAME,
    type: type ?? 'feature',
    priority: priority ?? 'medium',
    title,
    description,
    submitted_by: submitted_by ?? null,
    image_urls: image_urls ?? [],
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
