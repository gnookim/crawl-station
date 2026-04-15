import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * Instagram 계정 로그인 테스트 API
 *
 * POST /api/test/instagram-account
 *   body: { account_id }
 *   → 테스트 crawl_request 생성 후 request_id 즉시 반환 (non-blocking)
 *
 * GET /api/test/instagram-account?request_id=xxx&account_id=xxx
 *   → 결과 확인 (프론트엔드에서 폴링용)
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
    .select("id, username, assigned_worker_id, is_active")
    .eq("id", account_id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 404 });
  }

  // 테스트할 워커 결정: 전용 워커 → 온라인 워커 아무거나
  const cutoff = new Date(Date.now() - WORKER_ONLINE_THRESHOLD_MS).toISOString();
  let workerId: string | null = null;

  if (account.assigned_worker_id) {
    const { data: w } = await sb
      .from("workers")
      .select("id, last_seen, version")
      .eq("id", account.assigned_worker_id)
      .single();
    if (w && w.last_seen >= cutoff) workerId = w.id;
  }

  if (!workerId) {
    const { data: workers } = await sb
      .from("workers")
      .select("id, last_seen, version")
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(1);
    workerId = workers?.[0]?.id ?? null;
  }

  if (!workerId) {
    return NextResponse.json({ ok: false, error: "온라인 워커가 없습니다. 워커를 먼저 시작하세요." });
  }

  // 해당 워커의 버전 조회
  const { data: workerInfo } = await sb
    .from("workers")
    .select("version")
    .eq("id", workerId)
    .single();
  const workerVersion = workerInfo?.version || "알 수 없음";

  // 버전 체크 — v0.9.37 미만이면 경고 (테스트는 시도)
  const versionOk = isVersionAtLeast(workerVersion, "0.9.37");

  // 테스트 요청 생성 (즉시 반환)
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

  return NextResponse.json({
    pending: true,
    request_id: req.id,
    account_id,
    username: account.username,
    worker_id: workerId,
    worker_version: workerVersion,
    version_warning: versionOk ? null : `워커가 v${workerVersion}입니다. v0.9.37 이상으로 업데이트 후 재시작이 필요합니다.`,
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
    .select("status, error_message, created_at, completed_at")
    .eq("id", requestId)
    .single();

  if (!req) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const ageMs = Date.now() - new Date(req.created_at).getTime();
  const TIMEOUT_MS = 90_000;

  // 타임아웃 처리
  if (req.status !== "completed" && req.status !== "failed" && ageMs > TIMEOUT_MS) {
    const timeoutMsg = "타임아웃 (90초) — 워커가 instagram_login_test를 처리하지 못했습니다. 워커를 v0.9.37+ 로 재시작하세요.";
    await sb.from("instagram_accounts").update({
      last_test_at: now,
      last_test_status: "fail",
      last_test_error: timeoutMsg,
    }).eq("id", accountId);

    return NextResponse.json({ ok: false, done: true, error: timeoutMsg });
  }

  if (req.status === "completed") {
    await sb.from("instagram_accounts").update({
      last_test_at: now,
      last_test_status: "ok",
      last_test_error: null,
    }).eq("id", accountId);

    return NextResponse.json({ ok: true, done: true });
  }

  if (req.status === "failed") {
    const errMsg = req.error_message || "로그인 실패";
    await sb.from("instagram_accounts").update({
      last_test_at: now,
      last_test_status: "fail",
      last_test_error: errMsg,
    }).eq("id", accountId);

    return NextResponse.json({ ok: false, done: true, error: errMsg });
  }

  // 아직 처리 중
  return NextResponse.json({ done: false, status: req.status, age_ms: ageMs });
}

function isVersionAtLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => v.replace(/[^0-9.]/g, "").split(".").map(Number);
  const [ma, mi, pa] = parse(version);
  const [minMa, minMi, minPa] = parse(minimum);
  if (ma !== minMa) return ma > minMa;
  if (mi !== minMi) return mi > minMi;
  return (pa ?? 0) >= (minPa ?? 0);
}
