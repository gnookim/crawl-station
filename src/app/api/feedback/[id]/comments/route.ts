// GET/POST /api/feedback/[id]/comments
// @orch-std: feedback-api v2.1.0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SSO_URL = process.env.NEXT_PUBLIC_SSO_URL ?? 'https://lifenbio-sso.fly.dev'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await db()
    .from('orch_issue_comments')
    .select('*')
    .eq('issue_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // user_id 있으면 현재 이름으로 resolve
  const resolved = await Promise.all(
    (data ?? []).map(async (c) => {
      if (c.user_id && !c.is_admin) {
        const currentName = await resolveUserName(c.user_id, c.author_name)
        return { ...c, author_name: currentName }
      }
      return c
    })
  )

  return NextResponse.json(resolved)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { body, author_name, user_id, is_admin } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: '내용은 필수입니다' }, { status: 400 })

  const { data, error } = await db().from('orch_issue_comments').insert({
    issue_id: id,
    author_name: author_name ?? null,
    user_id: user_id ?? null,
    is_admin: is_admin ?? false,
    body: body.trim(),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
