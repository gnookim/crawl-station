// POST /api/feedback/upload — 이미지 업로드
// Supabase Storage 버킷: 'feedback-images' (public)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'feedback-images'
const MAX_SIZE = 5 * 1024 * 1024  // 5MB

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '5MB 이하만 업로드 가능합니다' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: '이미지 파일만 가능합니다' }, { status: 400 })

  const ext = file.name.split('.').pop() || 'png'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await storage.storage.from(BUCKET).upload(path, buffer, { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = storage.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
