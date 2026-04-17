import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const SSO_BASE = process.env.NEXT_PUBLIC_SSO_URL ?? "https://lifenbio-sso.fly.dev";

interface SSOUser {
  id: string;
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

type Params = { params: Promise<{ id: string; cid: string }> };

/** DELETE /api/feedback/[id]/comments/[cid] — 본인 또는 관리자 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, cid } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const sb = createServerClient();
  const { data: comment } = await sb
    .from("feedback_comments")
    .select("user_id")
    .eq("id", cid)
    .eq("feedback_id", id)
    .single();

  if (!comment) return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });

  if (comment.user_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  const { error } = await sb.from("feedback_comments").delete().eq("id", cid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
