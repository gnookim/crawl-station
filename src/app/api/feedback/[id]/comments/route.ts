import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const SSO_BASE = process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

interface SSOUser {
  id: string;
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

type Params = { params: Promise<{ id: string }> };

/** GET /api/feedback/[id]/comments — 댓글 목록 (오름차순) */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();
  const { data, error } = await sb
    .from("feedback_comments")
    .select("*")
    .eq("feedback_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

/** POST /api/feedback/[id]/comments — 댓글 작성 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getUser(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { body: commentBody, author_name } = body;
  if (!commentBody?.trim()) {
    return NextResponse.json({ error: "댓글 내용이 필요합니다." }, { status: 400 });
  }

  const sb = createServerClient();
  const { data, error } = await sb
    .from("feedback_comments")
    .insert({
      feedback_id: id,
      user_id:     user?.id ?? null,
      author_name: author_name?.trim() || user?.name || "익명",
      is_admin:    user?.role === "admin",
      body:        commentBody.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, comment: data }, { status: 201 });
}
