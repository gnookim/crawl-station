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
  // API 키 인증 (GitHub Actions 자동 배포용)
  const apiKey = request.headers.get("x-api-key");
  const validKey = process.env.RELEASE_API_KEY;
  if (validKey && apiKey !== validKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const body = await request.json();
  const { version, changelog, files } = body;

  if (!version) {
    return NextResponse.json(
      { error: "version이 필요합니다" },
      { status: 400 }
    );
  }

  // 동일 버전 중복 등록 방지 — 있으면 파일만 업데이트
  const { data: existing } = await sb
    .from("worker_releases")
    .select("id")
    .eq("version", version)
    .single();

  if (existing) {
    await sb
      .from("worker_releases")
      .update({ files: files || {}, changelog: changelog || "", is_latest: true })
      .eq("id", existing.id);
    await sb
      .from("worker_releases")
      .update({ is_latest: false })
      .eq("is_latest", true)
      .neq("id", existing.id);
    return NextResponse.json({ message: `v${version} 업데이트 완료 (기존 버전)`, updated: true });
  }

  // 새 릴리스 등록 먼저 (is_latest 간극 방지)
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

  if (!error && data) {
    // 새 릴리즈 등록 성공 후 기존 is_latest를 false로 (새 건 제외)
    await sb
      .from("worker_releases")
      .update({ is_latest: false })
      .eq("is_latest", true)
      .neq("id", data.id);
  }

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
