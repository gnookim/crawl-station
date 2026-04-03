import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { authenticateApiKey } from "@/lib/auth";
import { PRIORITY_BY_TYPE, WORKER_ONLINE_THRESHOLD_MS } from "@/types";

/**
 * Dispatch Agent — 작업 분배 API
 *
 * 인증: X-API-Key 헤더 필수
 *
 * POST /api/dispatch
 * body: { keywords: string[], type: string, strategy?: "round_robin", priority?: number }
 *
 * 활성 워커에게 작업을 자동 분배합니다.
 * 일일 할당량(daily_quota)을 초과한 워커는 분배 대상에서 제외됩니다.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "유효한 API 키가 필요합니다. X-API-Key 헤더를 확인하세요." },
      { status: 401 }
    );
  }

  const sb = createServerClient();
  const body = await request.json();
  const { keywords, type, strategy = "round_robin", priority } = body;

  if (!keywords?.length || !type) {
    return NextResponse.json(
      { error: "keywords와 type이 필요합니다" },
      { status: 400 }
    );
  }

  const effectivePriority = priority || PRIORITY_BY_TYPE[type] || 5;

  // 활성 워커 조회 (idle 또는 crawling 중이면서 최근 30초 이내 heartbeat)
  const cutoff = new Date(Date.now() - WORKER_ONLINE_THRESHOLD_MS).toISOString();
  const { data: activeWorkers } = await sb
    .from("workers")
    .select("id, name, status")
    .in("status", ["idle", "crawling", "online"])
    .gte("last_seen", cutoff)
    .order("id");

  if (!activeWorkers?.length) {
    const rows = keywords.map((keyword: string) => ({
      keyword,
      type,
      status: "pending",
      assigned_worker: null,
      priority: effectivePriority,
    }));
    await sb.from("crawl_requests").insert(rows);
    return NextResponse.json({
      message: `${keywords.length}개 작업 등록 (활성 워커 없음 — 미할당)`,
      assigned: 0,
      pending: keywords.length,
    });
  }

  // 워커별 quota 조회 + KST 자정 리셋
  const workerIds = activeWorkers.map((w) => w.id);
  const { data: configs } = await sb
    .from("worker_config")
    .select("id, daily_quota, daily_used, quota_reset_at")
    .in("id", workerIds);

  // 글로벌 기본값 조회
  const { data: globalConfig } = await sb
    .from("worker_config")
    .select("daily_quota")
    .eq("id", "global")
    .single();
  const defaultQuota = globalConfig?.daily_quota ?? 500;

  const kstToday = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  kstToday.setHours(0, 0, 0, 0);

  const configMap = new Map(
    (configs || []).map((c) => [c.id, c])
  );

  // quota 여유 있는 워커만 필터
  const availableWorkers: string[] = [];
  const quotaResets: string[] = [];

  for (const wid of workerIds) {
    const cfg = configMap.get(wid);
    const quota = cfg?.daily_quota ?? defaultQuota;
    let used = cfg?.daily_used ?? 0;
    const resetAt = cfg?.quota_reset_at
      ? new Date(cfg.quota_reset_at)
      : new Date(0);

    // KST 자정 지났으면 리셋
    if (resetAt < kstToday) {
      used = 0;
      quotaResets.push(wid);
    }

    if (used < quota) {
      availableWorkers.push(wid);
    }
  }

  // 리셋 필요한 워커 일괄 처리
  for (const wid of quotaResets) {
    await sb.rpc("reset_daily_quota_if_needed", { wid });
  }

  if (!availableWorkers.length) {
    const rows = keywords.map((keyword: string) => ({
      keyword,
      type,
      status: "pending",
      assigned_worker: null,
      priority: effectivePriority,
    }));
    await sb.from("crawl_requests").insert(rows);
    return NextResponse.json({
      message: `${keywords.length}개 작업 등록 (모든 워커 할당량 소진 — 미할당)`,
      assigned: 0,
      pending: keywords.length,
    });
  }

  // 분배 전략에 따라 워커별 작업 할당
  const assignments = distributeKeywords(
    keywords,
    availableWorkers,
    strategy
  );

  const rows = assignments.map(({ keyword, workerId }) => ({
    keyword,
    type,
    status: "assigned" as const,
    assigned_worker: workerId,
    priority: effectivePriority,
  }));

  await sb.from("crawl_requests").insert(rows);

  // 워커별 할당 수 집계 (quota increment는 워커가 작업 완료 시 처리)
  const workerCounts: Record<string, number> = {};
  for (const { workerId } of assignments) {
    workerCounts[workerId] = (workerCounts[workerId] || 0) + 1;
  }

  return NextResponse.json({
    message: `${keywords.length}개 작업을 ${availableWorkers.length}대 워커에 분배`,
    strategy,
    distribution: workerCounts,
    quota_exhausted_workers: workerIds.filter(
      (id) => !availableWorkers.includes(id)
    ),
  });
}

function distributeKeywords(
  keywords: string[],
  workerIds: string[],
  strategy: string
): { keyword: string; workerId: string }[] {
  switch (strategy) {
    case "round_robin":
    default:
      return keywords.map((keyword, i) => ({
        keyword,
        workerId: workerIds[i % workerIds.length],
      }));
  }
}
