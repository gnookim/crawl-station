// GET/POST /api/feedback/[id]/comments
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await db()
    .from('orch_issue_comments')
    .select('*')
    .eq('issue_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { body, author_name, is_admin } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: '내용은 필수입니다' }, { status: 400 })

  const { data, error } = await db().from('orch_issue_comments').insert({
    issue_id: id,
    author_name: author_name ?? null,
    is_admin: is_admin ?? false,
    body: body.trim(),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
