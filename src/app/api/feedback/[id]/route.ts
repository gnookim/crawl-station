import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getSSOUser } from "@/lib/feedback-auth";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/feedback/[id] — 상태 변경 / 관리자 답변 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getSSOUser(req);
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)  return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const sb = createServerClient();
  const { data: row } = await sb
    .from("feedback_requests").select("user_id, status").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });

  const isAdmin = user.role === "admin";
  const { status, admin_reply, reply_image_urls } = body;

  // 권한
  if (status === "done") {
    if (row.user_id !== user.id && !isAdmin)
      return NextResponse.json({ error: "확인 완료는 요청자 본인만 처리할 수 있습니다." }, { status: 403 });
  } else if (status || admin_reply !== undefined || reply_image_urls !== undefined) {
    if (!isAdmin)
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) {
    upd.status = status;
    if (status === "done") upd.completed_at = new Date().toISOString();
  }
  if (admin_reply !== undefined) {
    upd.admin_reply = admin_reply || null;
    upd.replied_at  = new Date().toISOString();
    upd.replied_by  = user.id;
  }
  if (reply_image_urls !== undefined) upd.reply_image_urls = reply_image_urls;

  const { data, error } = await sb
    .from("feedback_requests").update(upd).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, request: data });
}

/** DELETE /api/feedback/[id] — 본인 또는 관리자 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getSSOUser(req);
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const sb = createServerClient();
  const { data: row } = await sb
    .from("feedback_requests").select("user_id").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });

  if (row.user_id !== user.id && user.role !== "admin")
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });

  const { error } = await sb.from("feedback_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
