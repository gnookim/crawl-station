import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * Instagram 계정 로그인 테스트 API
 *
 * POST /api/test/instagram-account
 * body: { account_id: string }
 *
 * 1. 해당 계정의 assigned_worker 또는 온라인 Instagram 워커를 선택
 * 2. instagram_login_test 타입 crawl_request 생성
 * 3. 완료될 때까지 폴링 (최대 2분)
 * 4. 계정의 last_test_at / last_test_status 업데이트
 */

const TIMEOUT_MS = 120_000;
const POLL_MS = 3_000;

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
    .select("id, username, assigned_worker_id, is_active")
    .eq("id", account_id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 404 });
  }

  // 테스트할 워커 결정: 전용 워커 → 온라인 워커 중 아무거나
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
    return NextResponse.json({ ok: false, error: "온라인 워커가 없습니다" });
  }

  // 테스트 요청 생성
  const { data: req, error: insertErr } = await sb
    .from("crawl_requests")
    .insert({
      keyword: `login_test:${account.username}`,
      type: "instagram_login_test",
      status: "assigned",
      assigned_worker: workerId,
      priority: 99,
      options: { account_id, _test: true },
    })
    .select("id")
    .single();

  if (insertErr || !req) {
    return NextResponse.json({ error: "테스트 요청 생성 실패" }, { status: 500 });
  }

  // 결과 폴링
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const { data: check } = await sb
      .from("crawl_requests")
      .select("status, error_message")
      .eq("id", req.id)
      .single();

    if (!check) continue;

    const elapsed = Date.now() - start;
    const now = new Date().toISOString();

    if (check.status === "completed") {
      await sb.from("instagram_accounts").update({
        last_test_at: now,
        last_test_status: "ok",
        last_test_error: null,
      }).eq("id", account_id);

      return NextResponse.json({
        ok: true,
        account_id,
        username: account.username,
        worker_id: workerId,
        request_id: req.id,
        elapsed_ms: elapsed,
      });
    }

    if (check.status === "failed") {
      const errMsg = check.error_message || "로그인 실패";
      await sb.from("instagram_accounts").update({
        last_test_at: now,
        last_test_status: "fail",
        last_test_error: errMsg,
      }).eq("id", account_id);

      return NextResponse.json({
        ok: false,
        account_id,
        username: account.username,
        worker_id: workerId,
        request_id: req.id,
        error: errMsg,
        elapsed_ms: elapsed,
      });
    }
  }

  // 타임아웃
  const timeoutMsg = `타임아웃 (${TIMEOUT_MS / 1000}초) — 워커가 응답하지 않았습니다. 워커가 최신 버전(v0.9.37+)인지 확인하세요.`;
  await sb.from("instagram_accounts").update({
    last_test_at: new Date().toISOString(),
    last_test_status: "fail",
    last_test_error: timeoutMsg,
  }).eq("id", account_id);

  return NextResponse.json({
    ok: false,
    account_id,
    username: account.username,
    error: timeoutMsg,
    elapsed_ms: TIMEOUT_MS,
  });
}
