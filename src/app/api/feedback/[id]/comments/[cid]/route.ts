import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSSOUser } from "@/lib/feedback-auth";

type Params = { params: Promise<{ id: string; cid: string }> };

/** DELETE /api/feedback/[id]/comments/[cid] — 본인 또는 관리자 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, cid } = await params;
  const user = await getSSOUser(req);
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const sb = createServerClient();
  const { data: row } = await sb
    .from("feedback_comments")
    .select("user_id")
    .eq("id", cid)
    .eq("feedback_id", id)
    .single();
  if (!row) return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });

  if (row.user_id !== user.id && user.role !== "admin")
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });

  const { error } = await sb.from("feedback_comments").delete().eq("id", cid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
