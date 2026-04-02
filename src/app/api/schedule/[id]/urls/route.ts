import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type Params = { params: Promise<{ id: string }> };

/**
 * 스케줄 URL 관리
 * GET    /api/schedule/[id]/urls — URL 목록 (페이지네이션)
 * POST   /api/schedule/[id]/urls — URL 벌크 추가
 * DELETE /api/schedule/[id]/urls — URL 벌크 삭제
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = (page - 1) * limit;

  const sb = createServerClient();

  const { count } = await sb
    .from("daily_rank_urls")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", id);

  const { data } = await sb
    .from("daily_rank_urls")
    .select("*")
    .eq("schedule_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return NextResponse.json({
    urls: data || [],
    total: count || 0,
    page,
    limit,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();
  const body = await request.json();
  const items: { url: string; keyword: string; memo?: string }[] = body.items || [];

  if (!items.length) {
    return NextResponse.json({ error: "items 배열이 필요합니다" }, { status: 400 });
  }

  // 벌크 insert (500개씩 배치)
  let inserted = 0;
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500).map((item) => ({
      schedule_id: id,
      url: item.url,
      keyword: item.keyword,
      memo: item.memo || null,
    }));
    const { error } = await sb.from("daily_rank_urls").insert(batch);
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted },
        { status: 500 }
      );
    }
    inserted += batch.length;
  }

  return NextResponse.json({
    message: `${inserted}개 URL 등록 완료`,
    inserted,
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const sb = createServerClient();
  const body = await request.json();
  const urlIds: string[] = body.url_ids || [];

  if (!urlIds.length) {
    return NextResponse.json({ error: "url_ids 배열이 필요합니다" }, { status: 400 });
  }

  await sb
    .from("daily_rank_urls")
    .delete()
    .eq("schedule_id", id)
    .in("id", urlIds);

  return NextResponse.json({ message: `${urlIds.length}개 삭제 완료` });
}
