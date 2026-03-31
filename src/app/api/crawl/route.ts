import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * CrawlStation 연동 API — 외부 앱에서 크롤링 요청/결과 조회
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
    return NextResponse.json(
      { error: "keywords(배열)와 type이 필요합니다" },
      { status: 400 }
    );
  }

  const validTypes = [
    "kin_analysis",
    "blog_crawl",
    "blog_serp",
    "rank_check",
  ];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type은 ${validTypes.join(", ")} 중 하나여야 합니다` },
      { status: 400 }
    );
  }

  // 요청 등록
  const rows = keywords.map((keyword: string) => ({
    keyword,
    type,
    options: Object.keys(options).length > 0 ? options : null,
    status: "pending",
    priority,
    callback_url: callback_url || null,
  }));

  const { data, error } = await sb
    .from("crawl_requests")
    .insert(rows)
    .select("id, keyword, type, status, created_at");

  if (error) {
    return NextResponse.json(
      { error: `등록 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: `${data.length}개 크롤링 요청 등록 완료`,
    requests: data,
  });
}

export async function GET(request: NextRequest) {
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
      return NextResponse.json(
        { error: "요청을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 완료된 경우 결과도 함께 반환
    let results = null;
    if (req.status === "completed") {
      const { data } = await sb
        .from("crawl_results")
        .select("*")
        .eq("request_id", requestId)
        .order("rank");
      results = data;
    }

    return NextResponse.json({ request: req, results });
  }

  // 키워드+타입으로 결과 조회
  if (keyword) {
    let query = sb
      .from("crawl_results")
      .select("*")
      .eq("keyword", keyword)
      .order("created_at", { ascending: false })
      .limit(50);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ keyword, results: data });
  }

  return NextResponse.json(
    { error: "request_id 또는 keyword 파라미터가 필요합니다" },
    { status: 400 }
  );
}
