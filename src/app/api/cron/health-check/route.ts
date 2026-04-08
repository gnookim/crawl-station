import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * 헬스체크 Cron — 매일 KST 9시 실행
 *
 * 핸들러별 테스트 키워드로 크롤링 실행 → 결과 검증
 * 실패 시 station_settings에 기록 + 해당 타입 일시 중단
 */

const TEST_CASES: { type: string; keyword: string; minResults: number }[] = [
  { type: "blog_serp", keyword: "맛집 추천", minResults: 1 },
  { type: "kin_analysis", keyword: "다이어트 방법", minResults: 1 },
  { type: "area_analysis", keyword: "노트북 추천", minResults: 1 },
];

const TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;

export async function GET() {
  const sb = createServerClient();
  const now = new Date();

  // 현재 KST 시간 확인
  const kstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();

  // 실행 허용 시간대 확인 (기본: [9] = KST 오전 9시)
  const { data: scheduleSetting } = await sb
    .from("station_settings")
    .select("value")
    .eq("key", "health_check_hours")
    .single();

  const allowedHours: number[] = scheduleSetting?.value
    ? JSON.parse(scheduleSetting.value)
    : [9];

  if (!allowedHours.includes(kstHour)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: `헬스체크 건너뜀 — 현재 KST ${kstHour}시, 실행 시간: ${allowedHours.join(", ")}시`,
      kst_hour: kstHour,
      allowed_hours: allowedHours,
    });
  }

  // 활성 워커 1대 선택
  const cutoff = new Date(Date.now() - WORKER_ONLINE_THRESHOLD_MS).toISOString();
  const { data: workers } = await sb
    .from("workers")
    .select("id")
    .in("status", ["idle", "crawling", "online"])
    .gte("last_seen", cutoff)
    .limit(1);

  if (!workers?.length) {
    return NextResponse.json({
      ok: false,
      message: "활성 워커 없음 — 헬스체크 건너뜀",
      timestamp: now.toISOString(),
    });
  }

  const workerId = workers[0].id;
  const results: {
    type: string;
    keyword: string;
    ok: boolean;
    resultCount: number;
    elapsedMs: number;
    error?: string;
  }[] = [];

  // 핸들러별 순차 테스트
  for (const test of TEST_CASES) {
    const startTime = Date.now();

    // 테스트 요청 생성
    const { data: req, error: insertErr } = await sb
      .from("crawl_requests")
      .insert({
        keyword: test.keyword,
        type: test.type,
        status: "assigned",
        assigned_worker: workerId,
        priority: 99,
        options: { _health_check: true, max_items: 5, source: "health-check" },
      })
      .select("id")
      .single();

    if (insertErr || !req) {
      results.push({
        type: test.type,
        keyword: test.keyword,
        ok: false,
        resultCount: 0,
        elapsedMs: 0,
        error: "요청 생성 실패",
      });
      continue;
    }

    // 결과 대기 (폴링)
    let testOk = false;
    let resultCount = 0;
    let errorMsg = "";

    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const { data: check } = await sb
        .from("crawl_requests")
        .select("status, error_message")
        .eq("id", req.id)
        .single();

      if (!check) continue;

      if (check.status === "completed") {
        const { data: completed } = await sb
          .from("crawl_requests")
          .select("result")
          .eq("id", req.id)
          .single();
        try {
          const items = typeof completed?.result === "string"
            ? JSON.parse(completed.result)
            : completed?.result;
          resultCount = Array.isArray(items) ? items.length : (items ? 1 : 0);
        } catch { resultCount = 0; }
        testOk = resultCount >= test.minResults;
        if (!testOk) {
          errorMsg = `결과 ${resultCount}개 (최소 ${test.minResults}개 필요)`;
        }
        break;
      }

      if (check.status === "failed") {
        errorMsg = check.error_message || "크롤링 실패";
        break;
      }
    }

    if (!testOk && !errorMsg) {
      errorMsg = `타임아웃 (${TIMEOUT_MS / 1000}초)`;
    }

    results.push({
      type: test.type,
      keyword: test.keyword,
      ok: testOk,
      resultCount,
      elapsedMs: Date.now() - startTime,
      error: testOk ? undefined : errorMsg,
    });
  }

  // 결과 저장
  const allPassed = results.every((r) => r.ok);
  const failedTypes = results.filter((r) => !r.ok).map((r) => r.type);

  await sb.from("station_settings").upsert({
    key: "health_check_result",
    value: JSON.stringify({
      timestamp: now.toISOString(),
      worker_id: workerId,
      all_passed: allPassed,
      results,
    }),
    updated_at: now.toISOString(),
  });

  // 실패한 타입이 있으면 알림 기록
  if (failedTypes.length > 0) {
    await sb.from("station_settings").upsert({
      key: "health_check_alert",
      value: JSON.stringify({
        timestamp: now.toISOString(),
        failed_types: failedTypes,
        message: `헬스체크 실패: ${failedTypes.join(", ")}`,
      }),
      updated_at: now.toISOString(),
    });
  } else {
    // 이전 알림 해제
    await sb
      .from("station_settings")
      .delete()
      .eq("key", "health_check_alert");
  }

  return NextResponse.json({
    ok: allPassed,
    worker_id: workerId,
    results,
    failed_types: failedTypes,
    timestamp: now.toISOString(),
  });
}
