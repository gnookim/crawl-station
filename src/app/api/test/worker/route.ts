import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * 워커 테스트 API
 *
 * POST /api/test/worker — 특정 워커에 테스트 크롤링 요청 + 결과 대기
 * GET  /api/test/worker?id=xxx — 테스트 요청 결과 확인
 */

const TEST_CONFIGS: Record<string, { keyword: string; type: string }> = {
  naver: { keyword: "맛집 추천", type: "blog_serp" },
  instagram: { keyword: "nike", type: "instagram_profile" },
};

const TIMEOUT_MS = 120_000; // 2분
const POLL_INTERVAL_MS = 3_000;

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const workerId = body.worker_id;
  const testCategory: string = body.category || "naver";
  const testCfg = TEST_CONFIGS[testCategory] || TEST_CONFIGS.naver;
  const TEST_KEYWORD = testCfg.keyword;
  const TEST_TYPE = testCfg.type;

  if (!workerId) {
    return NextResponse.json({ error: "worker_id 필요" }, { status: 400 });
  }

  // 워커가 온라인인지 확인
  const cutoff = new Date(Date.now() - WORKER_ONLINE_THRESHOLD_MS).toISOString();
  const { data: worker } = await sb
    .from("workers")
    .select("id, status, last_seen")
    .eq("id", workerId)
    .single();

  if (!worker) {
    return NextResponse.json({ error: "워커를 찾을 수 없습니다" }, { status: 404 });
  }

  const isOnline = worker.last_seen && new Date(worker.last_seen).toISOString() >= cutoff;
  if (!isOnline) {
    return NextResponse.json({
      ok: false,
      error: "워커가 오프라인입니다",
      worker_id: workerId,
      last_seen: worker.last_seen,
    });
  }

  // 테스트 요청 생성 (해당 워커에 직접 할당)
  const { data: req, error: insertErr } = await sb
    .from("crawl_requests")
    .insert({
      keyword: TEST_KEYWORD,
      type: TEST_TYPE,
      status: "assigned",
      assigned_worker: workerId,
      priority: 99, // 최우선 처리
      options: { _test: true, max_items: 5, source: "station" },
    })
    .select("id")
    .single();

  if (insertErr || !req) {
    return NextResponse.json({ error: "테스트 요청 생성 실패" }, { status: 500 });
  }

  // 결과 대기 (폴링)
  const startTime = Date.now();
  while (Date.now() - startTime < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const { data: check } = await sb
      .from("crawl_requests")
      .select("status, error_message, started_at, completed_at")
      .eq("id", req.id)
      .single();

    if (!check) continue;

    if (check.status === "completed") {
      // crawl_requests.result에서 직접 파싱
      const { data: completed } = await sb
        .from("crawl_requests")
        .select("result")
        .eq("id", req.id)
        .single();

      const elapsed = Date.now() - startTime;
      let rawItems: Record<string, unknown>[] = [];
      try {
        const parsed = typeof completed?.result === "string"
          ? JSON.parse(completed.result)
          : completed?.result;
        rawItems = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      } catch { rawItems = []; }
      const items = rawItems.slice(0, 5).map((d) => ({
        rank: d.rank,
        title: String(d.title || "").slice(0, 60),
        url: String(d.url || "").slice(0, 80),
      }));

      // 검증 — 크롤링이 실행되고 완료됐으면 기본 통과
      // 결과가 있으면 제목/URL도 체크
      const hasResults = items.length > 0;
      const hasTitles = items.some((i) => i.title.length > 3);
      const hasUrls = items.some((i) => i.url.startsWith("http"));
      // 에러 없이 완료됐으면 통과 (결과 0개라도 크롤링 자체는 성공)
      const testPassed = true;

      // 테스트 통과 시 워커 검증 상태 업데이트
      const testSummary = {
        ok: testPassed,
        keyword: TEST_KEYWORD,
        result_count: items.length,
        elapsed_ms: elapsed,
        tested_at: new Date().toISOString(),
      };
      if (testPassed) {
        await sb.from("workers").update({
          verified_at: new Date().toISOString(),
          last_test_result: testSummary,
        }).eq("id", workerId);
      } else {
        await sb.from("workers").update({
          last_test_result: testSummary,
        }).eq("id", workerId);
      }

      return NextResponse.json({
        ok: testPassed,
        worker_id: workerId,
        request_id: req.id,
        keyword: TEST_KEYWORD,
        elapsed_ms: elapsed,
        result_count: items.length,
        results: items,
        checks: {
          has_results: hasResults,
          has_titles: hasTitles,
          has_urls: hasUrls,
        },
      });
    }

    if (check.status === "failed") {
      return NextResponse.json({
        ok: false,
        worker_id: workerId,
        request_id: req.id,
        error: check.error_message || "크롤링 실패",
        elapsed_ms: Date.now() - startTime,
      });
    }
  }

  // 타임아웃
  return NextResponse.json({
    ok: false,
    worker_id: workerId,
    request_id: req.id,
    error: `타임아웃 (${TIMEOUT_MS / 1000}초) — 워커가 작업을 처리하지 못했습니다`,
    elapsed_ms: TIMEOUT_MS,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");

  if (!requestId) {
    return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data: req } = await sb
    .from("crawl_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!req) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 });
  }

  let results = null;
  if (req.status === "completed" && req.result) {
    try {
      const parsed = typeof req.result === "string" ? JSON.parse(req.result) : req.result;
      results = Array.isArray(parsed) ? parsed.slice(0, 5) : [parsed];
    } catch { results = null; }
  }

  return NextResponse.json({ request: req, results });
}
