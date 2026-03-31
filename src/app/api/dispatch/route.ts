import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { authenticateApiKey } from "@/lib/auth";

/**
 * Dispatch Agent — 작업 분배 API
 *
 * 인증: X-API-Key 헤더 필수
 *
 * POST /api/dispatch
 * body: { keywords: string[], type: string, strategy?: "round_robin" | "load_based" | "ip_spread" }
 *
 * 활성 워커에게 작업을 자동 분배합니다.
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
  const { keywords, type, strategy = "round_robin" } = body;

  if (!keywords?.length || !type) {
    return NextResponse.json(
      { error: "keywords와 type이 필요합니다" },
      { status: 400 }
    );
  }

  // 활성 워커 조회 (idle 또는 crawling 중이면서 최근 15초 이내 heartbeat)
  const cutoff = new Date(Date.now() - 15000).toISOString();
  const { data: activeWorkers } = await sb
    .from("workers")
    .select("id, name, status")
    .in("status", ["idle", "crawling", "online"])
    .gte("last_seen", cutoff)
    .order("id");

  if (!activeWorkers?.length) {
    // 활성 워커 없으면 미할당 상태로 등록
    const rows = keywords.map((keyword: string) => ({
      keyword,
      type,
      status: "pending",
      assigned_worker: null,
      priority: 0,
    }));
    await sb.from("crawl_requests").insert(rows);
    return NextResponse.json({
      message: `${keywords.length}개 작업 등록 (활성 워커 없음 — 미할당)`,
      assigned: 0,
      pending: keywords.length,
    });
  }

  // 분배 전략에 따라 워커별 작업 할당
  const assignments = distributeKeywords(
    keywords,
    activeWorkers.map((w) => w.id),
    strategy
  );

  const rows = assignments.map(({ keyword, workerId }) => ({
    keyword,
    type,
    status: "assigned" as const,
    assigned_worker: workerId,
    priority: 0,
  }));

  await sb.from("crawl_requests").insert(rows);

  // 워커별 할당 수 집계
  const workerCounts: Record<string, number> = {};
  for (const { workerId } of assignments) {
    workerCounts[workerId] = (workerCounts[workerId] || 0) + 1;
  }

  return NextResponse.json({
    message: `${keywords.length}개 작업을 ${activeWorkers.length}대 워커에 분배`,
    strategy,
    distribution: workerCounts,
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
