import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * Oclick 테스트 API
 *
 * POST /api/test/oclick — oclick_sync 요청 등록 후 crawler-app 결과 대기
 * body: { company_code, user_id, password }  (옵션 — 미입력 시 station_settings에서 로드)
 */

const TIMEOUT_MS = 180_000; // 3분 (Oclick은 상품이 많으면 오래 걸림)
const POLL_INTERVAL_MS = 4_000;

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json().catch(() => ({}));

  // credentials: 요청에서 받거나 station_settings에서 로드
  let { company_code, user_id, password } = body;

  if (!company_code || !user_id || !password) {
    const { data: rows } = await sb
      .from("station_settings")
      .select("key, value")
      .in("key", ["oclick_company_code", "oclick_user_id", "oclick_password"]);

    const cfg: Record<string, string> = {};
    for (const r of rows || []) cfg[r.key] = r.value;
    company_code = company_code || cfg.oclick_company_code || "";
    user_id      = user_id      || cfg.oclick_user_id      || "";
    password     = password     || cfg.oclick_password     || "";
  }

  if (!company_code || !user_id || !password) {
    return NextResponse.json(
      { error: "company_code, user_id, password 필요 (또는 station_settings에 oclick_* 등록)" },
      { status: 400 }
    );
  }

  // 테스트 요청 생성
  const { data: req, error: insertErr } = await sb
    .from("crawl_requests")
    .insert({
      keyword: company_code,
      type: "oclick_sync",
      status: "pending",
      priority: 99,
      options: {
        company_code,
        user_id,
        password,
        _test: true,
        source: "station",
      },
    })
    .select("id")
    .single();

  if (insertErr || !req) {
    return NextResponse.json({ error: `요청 생성 실패: ${insertErr?.message}` }, { status: 500 });
  }

  const startTime = Date.now();

  // 결과 폴링
  while (Date.now() - startTime < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const { data: check } = await sb
      .from("crawl_requests")
      .select("status, error_message, completed_at")
      .eq("id", req.id)
      .single();

    if (!check) continue;

    const elapsed = Date.now() - startTime;

    if (check.status === "completed") {
      const { data: resultRows } = await sb
        .from("crawl_results")
        .select("data")
        .eq("request_id", req.id)
        .order("id", { ascending: true });

      const items = (resultRows || []).map((r) => r.data as Record<string, unknown>);

      return NextResponse.json({
        ok: true,
        request_id: req.id,
        elapsed_ms: elapsed,
        item_count: items.length,
        sample: items.slice(0, 5),
      });
    }

    if (check.status === "failed") {
      return NextResponse.json({
        ok: false,
        request_id: req.id,
        elapsed_ms: elapsed,
        error: check.error_message || "크롤링 실패",
      });
    }
  }

  return NextResponse.json({
    ok: false,
    request_id: req.id,
    error: `타임아웃 (${TIMEOUT_MS / 1000}초) — crawler-app이 실행 중인지 확인하세요`,
    elapsed_ms: TIMEOUT_MS,
  });
}
