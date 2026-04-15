import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 워커 설정 API
 *
 * GET  /api/config              — global 설정 조회
 * GET  /api/config?id=worker-xx — 워커별 설정 조회
 * POST /api/config              — 설정 저장 (upsert)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const all = searchParams.get("all") === "1";

  const sb = createServerClient();

  // 전체 설정 일괄 조회 (워커 목록 로드 시 사용 — N번 개별 호출 방지)
  if (all) {
    const { data } = await sb.from("worker_config").select("*");
    return NextResponse.json({ configs: data || [] });
  }

  const configId = id || "global";
  const { data, error } = await sb
    .from("worker_config")
    .select("*")
    .eq("id", configId)
    .single();

  if (error || !data) {
    if (configId === "global") {
      return NextResponse.json({
        config: {
          id: "global",
          batch_size: 30,
          batch_rest_seconds: 180,
          keyword_delay_min: 15,
          keyword_delay_max: 30,
          typo_probability: 0.05,
          scroll_back_probability: 0.4,
          proxy_url: "",
          network_type: "wifi",
          daily_quota: 500,
          daily_used: 0,
          rest_hours: [3, 4, 5],
        },
      });
    }
    return NextResponse.json({ error: "설정을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ config: data });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { id = "global", ...updates } = body;

  // updated_at, updated_by 자동 설정
  updates.updated_at = new Date().toISOString();
  updates.updated_by = "station";

  const { error } = await sb
    .from("worker_config")
    .upsert({ id, ...updates })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `설정 저장 완료 (${id})` });
}
