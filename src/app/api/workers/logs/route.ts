import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 워커 에러 로그 API
 *
 * GET /api/workers/logs?worker_id=xxx&limit=50  — 워커 로그 조회
 * DELETE /api/workers/logs?worker_id=xxx        — 워커 로그 전체 삭제
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("worker_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const sb = createServerClient();
  try {
    let q = sb
      .from("worker_logs")
      .select("id, worker_id, level, message, context, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (workerId) q = q.eq("worker_id", workerId);

    const { data, error } = await q;
    if (error) {
      // 테이블 미생성 시 빈 배열 반환
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({ logs: [], migration_needed: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ logs: data || [] });
  } catch {
    return NextResponse.json({ logs: [], migration_needed: true });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("worker_id");
  if (!workerId) return NextResponse.json({ error: "worker_id 필요" }, { status: 400 });

  const sb = createServerClient();
  const { error } = await sb.from("worker_logs").delete().eq("worker_id", workerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "로그 삭제 완료" });
}
