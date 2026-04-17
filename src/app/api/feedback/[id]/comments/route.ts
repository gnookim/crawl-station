import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSSOUser } from "@/lib/feedback-auth";

type Params = { params: Promise<{ id: string }> };

/** GET /api/feedback/[id]/comments */
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

/** POST /api/feedback/[id]/comments */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getSSOUser(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { body: text, author_name } = body;
  if (!text?.trim()) return NextResponse.json({ error: "댓글 내용이 필요합니다." }, { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("feedback_comments")
    .insert({
      feedback_id: id,
      user_id:     user?.id ?? null,
      author_name: author_name?.trim() || user?.name || "익명",
      is_admin:    user?.role === "admin",
      body:        text.trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, comment: data }, { status: 201 });
}
