import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { authenticateApiKey } from "@/lib/auth";
import { PRIORITY_BY_TYPE } from "@/types";

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed =
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.sesame11210\.com$/.test(origin) ||
    origin === "https://sesame11210.com";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const h = corsHeaders(req);
  Object.entries(h).forEach(([k, v]) => { if (v) res.headers.set(k, v); });
  return res;
}

/**
 * CrawlStation 연동 API — 외부 앱에서 크롤링 요청/결과 조회
 *
 * 인증: X-API-Key 헤더 필수 (POST), GET은 선택
 *
 * POST /api/crawl — 크롤링 요청 등록
 * body: {
 *   keywords: string[],          // 키워드 목록
 *   type: string,                // "blog_crawl" | "blog_serp" | "kin_analysis" | "rank_check"
 *   options?: object,            // 핸들러별 추가 옵션
 *   priority?: number,           // 우선순위 (높을수록 먼저, 기본 0)
 *   callback_url?: string,       // 완료 시 webhook URL (선택)
 * }
 *
 * GET /api/crawl?request_id=xxx — 특정 요청 상태+결과 조회
 * GET /api/crawl?keyword=xxx&type=xxx — 키워드+타입으로 결과 조회
 */
export async function POST(request: NextRequest) {
  const cors = (res: NextResponse) => withCors(request, res);
  // API 키 인증
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return cors(NextResponse.json(
      { error: "유효한 API 키가 필요합니다. X-API-Key 헤더를 확인하세요." },
      { status: 401 }
    ));
  }

  const sb = createServerClient();
  const body = await request.json();
  const {
    keywords,
    type,
    options = {},
    priority = 0,
    callback_url,
  } = body;

  if (!keywords?.length || !type) {
    return cors(NextResponse.json(
      { error: "keywords(배열)와 type이 필요합니다" },
      { status: 400 }
    ));
  }

  const validTypes = [
    "kin_analysis",
    "blog_crawl",
    "blog_serp",
    "rank_check",
    "deep_analysis",
    "area_analysis",
    "daily_rank",
    "oclick_sync",
  ];
  if (!validTypes.includes(type)) {
    return cors(NextResponse.json(
      { error: `type은 ${validTypes.join(", ")} 중 하나여야 합니다` },
      { status: 400 }
    ));
  }

  // 요청 등록 (priority 미지정 시 타입별 기본값 적용)
  const effectivePriority = priority || PRIORITY_BY_TYPE[type] || 5;

  // deep_analysis → 영역별 서브태스크 분할
  if (type === "deep_analysis") {
    const SCOPES = ["integrated", "blog_tab", "kin_tab", "cafe_tab"];
    const parentRows = keywords.map((keyword: string) => ({
      keyword,
      type: "deep_analysis",
      options: Object.keys(options).length > 0 ? options : null,
      status: "pending" as const,
      priority: effectivePriority,
      ...(callback_url ? { callback_url } : {}),
    }));

    const { data: parents, error: parentErr } = await sb
      .from("crawl_requests")
      .insert(parentRows)
      .select("id, keyword");

    if (parentErr || !parents) {
      return cors(NextResponse.json(
        { error: `등록 실패: ${parentErr?.message}` },
        { status: 500 }
      ));
    }

    // 각 부모 요청 → 4개 서브태스크 생성
    const subtaskRows = parents.flatMap((parent) =>
      SCOPES.map((scope) => ({
        keyword: parent.keyword,
        type: "deep_analysis",
        options: { ...options, scope },
        status: "pending" as const,
        priority: effectivePriority,
        parent_id: parent.id,
        scope,
      }))
    );

    await sb.from("crawl_requests").insert(subtaskRows);

    // 부모 요청 상태를 assigned로 (서브태스크가 처리)
    await sb
      .from("crawl_requests")
      .update({ status: "assigned" })
      .in("id", parents.map((p) => p.id));

    return cors(NextResponse.json({
      message: `${parents.length}개 심화분석 요청 → ${subtaskRows.length}개 서브태스크로 분할`,
      requests: parents,
      subtasks_per_keyword: SCOPES.length,
    }));
  }

  // 일반 요청 등록
  const rows = keywords.map((keyword: string) => {
    const row: Record<string, unknown> = {
      keyword,
      type,
      options: Object.keys(options).length > 0 ? options : null,
      status: "pending",
      priority: effectivePriority,
    };
    if (callback_url) row.callback_url = callback_url;
    return row;
  });

  const { data, error } = await sb
    .from("crawl_requests")
    .insert(rows)
    .select("id, keyword, type, status, created_at");

  if (error) {
    return cors(NextResponse.json(
      { error: `등록 실패: ${error.message}` },
      { status: 500 }
    ));
  }

  return cors(NextResponse.json({
    message: `${data.length}개 크롤링 요청 등록 완료`,
    requests: data,
  }));
}

export async function GET(request: NextRequest) {
  const cors = (res: NextResponse) => withCors(request, res);
  const sb = createServerClient();
  const { searchParams } = new URL(request.url);

  const requestId = searchParams.get("request_id");
  const keyword = searchParams.get("keyword");
  const type = searchParams.get("type");

  // 특정 요청 ID로 조회
  if (requestId) {
    const { data: req } = await sb
      .from("crawl_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (!req) {
      return cors(NextResponse.json(
        { error: "요청을 찾을 수 없습니다" },
        { status: 404 }
      ));
    }

    // 완료된 경우 result 필드를 파싱하여 반환
    let results = null;
    if (req.status === "completed" && req.result) {
      try {
        results = typeof req.result === "string" ? JSON.parse(req.result) : req.result;
      } catch { results = null; }
    }

    return cors(NextResponse.json({ request: req, results }));
  }

  // 키워드+타입으로 결과 조회 — crawl_requests 에서 직접
  if (keyword) {
    let query = sb
      .from("crawl_requests")
      .select("id, keyword, type, result, completed_at, options")
      .eq("keyword", keyword)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(50);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      return cors(NextResponse.json({ error: error.message }, { status: 500 }));
    }

    // result JSON 파싱
    const parsed = (data || []).map((row) => {
      try {
        return {
          ...row,
          result: typeof row.result === "string" ? JSON.parse(row.result) : row.result,
        };
      } catch { return row; }
    });

    return cors(NextResponse.json({ keyword, results: parsed }));
  }

  return cors(NextResponse.json(
    { error: "request_id 또는 keyword 파라미터가 필요합니다" },
    { status: 400 }
  ));
}
