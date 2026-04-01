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
  const id = searchParams.get("id") || "global";

  const sb = createServerClient();
  const { data, error } = await sb
    .from("worker_config")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    // global이 없으면 기본값 반환
    if (id === "global") {
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
