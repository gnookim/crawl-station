import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * CrawlStation 연동 API — 워커 상태 조회 + 삭제
 *
 * GET    /api/workers           — 전체 워커 목록 + 상태
 * DELETE /api/workers?id=xxx    — 워커 삭제 (언인스톨 시)
 */
export async function GET() {
  const sb = createServerClient();

  const { data, error } = await sb
    .from("workers")
    .select("id, name, os, status, last_seen, current_keyword, current_type, total_processed, error_count")
    .order("last_seen", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const workers = (data || []).map((w) => ({
    ...w,
    is_active: w.last_seen
      ? now - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS
      : false,
  }));

  return NextResponse.json({
    total: workers.length,
    active: workers.filter((w) => w.is_active).length,
    workers,
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "워커 ID가 필요합니다" },
      { status: 400 }
    );
  }

  const sb = createServerClient();
  const { error } = await sb.from("workers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `워커 ${id} 삭제 완료` });
}
