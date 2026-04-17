/**
 * GET/POST /api/feedback
 *
 * 사전 실행 필요한 SQL (Supabase SQL Editor):
 * ─────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS feedback_requests (
 *   id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   type             varchar(20) NOT NULL DEFAULT 'feature',
 *   priority         varchar(10) NOT NULL DEFAULT 'medium',
 *   title            varchar(200) NOT NULL,
 *   description      text NOT NULL,
 *   status           varchar(20) NOT NULL DEFAULT 'pending',
 *   submitted_by     varchar(100),
 *   user_id          uuid,
 *   admin_reply      text,
 *   reply_image_urls text[] DEFAULT '{}',
 *   replied_at       timestamptz,
 *   replied_by       uuid,
 *   completed_at     timestamptz,
 *   image_urls       text[] DEFAULT '{}',
 *   created_at       timestamptz NOT NULL DEFAULT now(),
 *   updated_at       timestamptz NOT NULL DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_requests(status);
 * ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "feedback_all" ON feedback_requests FOR ALL USING (true);
 *
 * CREATE TABLE IF NOT EXISTS feedback_comments (
 *   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   feedback_id uuid NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
 *   user_id     uuid,
 *   author_name varchar(100),
 *   is_admin    boolean NOT NULL DEFAULT false,
 *   body        text NOT NULL,
 *   created_at  timestamptz NOT NULL DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_feedback_comments_feedback ON feedback_comments(feedback_id);
 * ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "feedback_comments_all" ON feedback_comments FOR ALL USING (true);
 *
 * -- Storage: Supabase Storage > New bucket > "feedback-images" > Public ON
 * ─────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const SSO_BASE = process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

interface SSOUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

async function getUser(req: NextRequest): Promise<SSOUser | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${SSO_BASE}/auth/me`, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** GET /api/feedback — 목록 조회 or 미해결 카운트 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sb = createServerClient();

  // ?count=true → 사이드바 뱃지용
  if (searchParams.get("count") === "true") {
    const { count } = await sb
      .from("feedback_requests")
      .select("*", { count: "exact", head: true })
      .not("status", "eq", "done");
    return NextResponse.json({ unresolved: count ?? 0 });
  }

  const status = searchParams.get("status");
  let query = sb
    .from("feedback_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

/** POST /api/feedback — 새 피드백 제출 (비로그인 허용) */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { type, priority, title, description, submitted_by, image_urls } = body;
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "title과 description은 필수입니다." }, { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from("feedback_requests")
    .insert({
      type: type ?? "feature",
      priority: priority ?? "medium",
      title: title.trim(),
      description: description.trim(),
      submitted_by: submitted_by?.trim() || user?.name || null,
      user_id: user?.id ?? null,
      image_urls: image_urls ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, request: data }, { status: 201 });
}
