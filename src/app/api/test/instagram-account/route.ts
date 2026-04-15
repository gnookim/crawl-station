import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * Instagram 계정 테스트 API
 *
 * POST /api/test/instagram-account
 *   body: { account_id }
 *   → 기존 instagram_profile 타입으로 테스트 요청 생성 (어떤 워커 버전이든 동작)
 *   → 반환: { pending: true, request_id, ... }
 *
 * GET /api/test/instagram-account?request_id=xxx&account_id=xxx
 *   → 결과 폴링 (프론트엔드에서 3초마다 호출)
 *
 * 테스트 방식:
 *   계정 풀(pool)에서 해당 계정을 자동 선택하도록 유도 → 로그인 + @instagram 크롤링
 *   → completed + 결과 있음: 로그인 + 크롤링 성공
 *   → completed + 결과 없음: 로그인됐지만 데이터 없음 (세션 의심)
 *   → failed: 로그인 실패 또는 차단
 */

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { account_id } = body;

  if (!account_id) {
    return NextResponse.json({ error: "account_id 필요" }, { status: 400 });
  }

  // 계정 조회
  const { data: account } = await sb
    .from("instagram_accounts")
    .select("id, username, assigned_worker_id, is_active, status")
    .eq("id", account_id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 404 });
  }

  // 온라인 워커 선택: 전용 워커 우선 → 활성 워커 중 아무거나
  const cutoff = new Date(Date.now() - WORKER_ONLINE_THRESHOLD_MS).toISOString();
  let workerId: string | null = null;

  if (account.assigned_worker_id) {
    const { data: w } = await sb
      .from("workers")
      .select("id, last_seen")
      .eq("id", account.assigned_worker_id)
      .single();
    if (w && w.last_seen >= cutoff) workerId = w.id;
  }

  if (!workerId) {
    const { data: workers } = await sb
      .from("workers")
      .select("id, last_seen")
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(1);
    workerId = workers?.[0]?.id ?? null;
  }

  if (!workerId) {
    return NextResponse.json({ ok: false, error: "온라인 워커가 없습니다. 워커를 먼저 시작하세요." });
  }

  // 테스트 직전: 해당 계정의 last_used_at을 오래된 시간으로 설정해서 LRU 우선순위 1위로 만들기
  // → 워커가 _pick_account() 호출 시 이 계정을 반드시 선택하도록 유도
  await sb.from("instagram_accounts").update({
    last_used_at: "2000-01-01T00:00:00.000Z",
  }).eq("id", account_id);

  // instagram_profile 타입으로 요청 생성 (기존 핸들러, 어떤 워커 버전이든 처리 가능)
  const { data: req, error: insertErr } = await sb
    .from("crawl_requests")
    .insert({
      keyword: "instagram",          // @instagram 공식 계정 크롤링
      type: "instagram_profile",
      status: "assigned",
      assigned_worker: workerId,
      priority: 99,
      options: {
        usernames: ["instagram"],    // 항상 공개된 대형 계정으로 로그인 검증
        fetchReelsCount: false,
        _test: true,
        _test_account_id: account_id,
      },
    })
    .select("id")
    .single();

  if (insertErr || !req) {
    return NextResponse.json({ error: "테스트 요청 생성 실패" }, { status: 500 });
  }

  return NextResponse.json({
    pending: true,
    request_id: req.id,
    account_id,
    username: account.username,
    worker_id: workerId,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("request_id");
  const accountId = searchParams.get("account_id");

  if (!requestId || !accountId) {
    return NextResponse.json({ error: "request_id, account_id 필요" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data: req } = await sb
    .from("crawl_requests")
    .select("status, error_message, created_at")
    .eq("id", requestId)
    .single();

  if (!req) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const ageMs = Date.now() - new Date(req.created_at).getTime();
  const TIMEOUT_MS = 120_000; // 2분 (실제 로그인 + 크롤링 시간 확보)

  if (req.status !== "completed" && req.status !== "failed" && ageMs > TIMEOUT_MS) {
    const msg = "타임아웃 (2분) — 워커가 응답하지 않았습니다. 워커가 온라인인지 확인하세요.";
    await sb.from("instagram_accounts").update({
      last_test_at: now, last_test_status: "fail", last_test_error: msg,
    }).eq("id", accountId);
    return NextResponse.json({ ok: false, done: true, error: msg });
  }

  if (req.status === "completed") {
    // crawl_results에서 결과 확인
    const { data: results } = await sb
      .from("crawl_results")
      .select("data")
      .eq("request_id", requestId)
      .limit(1);

    const result = results?.[0]?.data as Record<string, unknown> | undefined;
    const followerCount = result?.follower_count as number | undefined;
    const hasData = result && (followerCount ?? 0) > 0;

    if (hasData) {
      // 로그인 + 크롤링 모두 성공
      await sb.from("instagram_accounts").update({
        last_test_at: now, last_test_status: "ok", last_test_error: null,
      }).eq("id", accountId);
      return NextResponse.json({
        ok: true, done: true,
        detail: `로그인 + 크롤링 성공 (팔로워 ${(followerCount ?? 0).toLocaleString()}명 수집)`,
      });
    } else {
      // completed지만 데이터 없음 → 익명 크롤링 or 세션 만료
      const msg = "크롤링 완료됐으나 데이터 없음 — 비로그인 상태로 처리됐을 수 있습니다. 비밀번호나 세션을 확인하세요.";
      await sb.from("instagram_accounts").update({
        last_test_at: now, last_test_status: "fail", last_test_error: msg,
      }).eq("id", accountId);
      return NextResponse.json({ ok: false, done: true, error: msg });
    }
  }

  if (req.status === "failed") {
    const errMsg = req.error_message || "크롤링 실패";
    await sb.from("instagram_accounts").update({
      last_test_at: now, last_test_status: "fail", last_test_error: errMsg,
    }).eq("id", accountId);
    return NextResponse.json({ ok: false, done: true, error: errMsg });
  }

  // 아직 처리 중
  return NextResponse.json({ done: false, status: req.status, age_ms: ageMs });
}
