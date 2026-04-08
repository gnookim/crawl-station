import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 크롤링 완료 보고 API — crawler-app이 호출
 *
 * crawler-app은 crawl-station만 알면 되고,
 * callback(lb_product 등 외부 시스템) 발송은 crawl-station이 담당.
 *
 * POST /api/crawl/complete
 * headers: X-Worker-Id: {worker_id}
 * body: {
 *   request_id: string,       // crawl_requests.id
 *   status: "completed" | "failed",
 *   result: any,              // 크롤링 결과
 *   error?: string,           // 실패 시 에러 메시지
 * }
 */
export async function POST(request: NextRequest) {
  const workerId = request.headers.get("x-worker-id") || "unknown";
  const sb = createServerClient();

  let body: {
    request_id: string;
    status: "completed" | "failed";
    result?: unknown;
    error?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const { request_id, status, result, error } = body;

  if (!request_id || !status) {
    return NextResponse.json(
      { error: "request_id와 status가 필요합니다" },
      { status: 400 }
    );
  }

  // 1. crawl_requests 업데이트
  const { data: req, error: updateErr } = await sb
    .from("crawl_requests")
    .update({
      status,
      result: result ? JSON.stringify(result) : null,
      error_message: error || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", request_id)
    .select("id, type, keyword, callback_url, options")
    .single();

  if (updateErr || !req) {
    return NextResponse.json(
      { error: `잡 업데이트 실패: ${updateErr?.message}` },
      { status: 500 }
    );
  }

  // 2. 워커 stats 업데이트
  if (workerId !== "unknown") {
    await sb
      .from("workers")
      .update({
        status: "idle",
        current_task_id: null,
        current_keyword: null,
        current_type: null,
      })
      .eq("id", workerId)
      .then(() => {});

    // total_processed atomic increment
    try { await sb.rpc("increment_worker_processed", { wid: workerId }); } catch { /* ignore */ }
  }

  // 3. callback_url이 있으면 crawl-station이 직접 발송
  let callbackResult: { ok: boolean; status?: number; error?: string } | null = null;

  if (req.callback_url && status === "completed") {
    callbackResult = await dispatchCallback(req.callback_url, {
      request_id,
      type: req.type,
      keyword: req.keyword,
      ...(result as object),
    });
  }

  return NextResponse.json({
    ok: true,
    request_id,
    status,
    callback: callbackResult,
  });
}

async function dispatchCallback(
  callbackUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message?.slice(0, 100) };
  }
}
