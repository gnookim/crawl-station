import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * 워커 릴리스 관리 API
 *
 * GET  /api/releases — 릴리스 목록 조회
 * POST /api/releases — 새 릴리스 등록 (워커 파일 업로드)
 */
export async function GET() {
  const sb = createServerClient();
  const { data } = await sb
    .from("worker_releases")
    .select("*")
    .order("created_at", { ascending: false });

  return NextResponse.json({ releases: data || [] });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { version, changelog, files } = body;

  if (!version) {
    return NextResponse.json(
      { error: "version이 필요합니다" },
      { status: 400 }
    );
  }

  // 기존 is_latest를 모두 false로
  await sb
    .from("worker_releases")
    .update({ is_latest: false })
    .eq("is_latest", true);

  // 새 릴리스 등록
  const { data, error } = await sb
    .from("worker_releases")
    .insert({
      version,
      changelog: changelog || "",
      files: files || {},
      is_latest: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `등록 실패: ${error.message}` },
      { status: 500 }
    );
  }

  // 워커들의 현재 버전과 비교 → outdated 워커 수 계산
  const { count } = await sb
    .from("workers")
    .select("id", { count: "exact", head: true })
    .neq("version", version);

  return NextResponse.json({
    message: `v${version} 릴리스 등록 완료`,
    release: data,
    outdated_workers: count || 0,
  });
}
