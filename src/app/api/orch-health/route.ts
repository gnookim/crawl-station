import { NextResponse } from 'next/server'
import { orchHealth } from '@/lib/orch'

export async function GET() {
  await orchHealth('ok')
  return NextResponse.json({ ok: true })
}
