import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * CrawlStation 연동 API — 워커 상태 조회
 *
 * GET /api/workers — 전체 워커 목록 + 상태
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
      ? now - new Date(w.last_seen).getTime() < 15000
      : false,
  }));

  return NextResponse.json({
    total: workers.length,
    active: workers.filter((w) => w.is_active).length,
    workers,
  });
}
