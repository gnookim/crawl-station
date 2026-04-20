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
  const { version, changelog, files, worker_type = "pc" } = body;

  if (!version) {
    return NextResponse.json(
      { error: "version이 필요합니다" },
      { status: 400 }
    );
  }

  // 동일 버전+타입 중복 등록 방지 — 있으면 파일만 업데이트
  const { data: existing } = await sb
    .from("worker_releases")
    .select("id")
    .eq("version", version)
    .eq("worker_type", worker_type)
    .single();

  if (existing) {
    await sb
      .from("worker_releases")
      .update({ files: files || {}, changelog: changelog || "", is_latest: true })
      .eq("id", existing.id);
    // is_latest는 같은 worker_type 내에서만 단일 유지
    await sb
      .from("worker_releases")
      .update({ is_latest: false })
      .eq("is_latest", true)
      .eq("worker_type", worker_type)
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
      worker_type,
    })
    .select()
    .single();

  if (!error && data) {
    // 같은 worker_type의 이전 is_latest를 false로 (다른 타입은 건드리지 않음)
    await sb
      .from("worker_releases")
      .update({ is_latest: false })
      .eq("is_latest", true)
      .eq("worker_type", worker_type)
      .neq("id", data.id);
  }

  if (error) {
    return NextResponse.json(
      { error: `등록 실패: ${error.message}` },
      { status: 500 }
    );
  }

  // PC 워커만 outdated 카운트 (모바일은 자체 핫리로드)
  let outdated_workers = 0;
  if (worker_type === "pc") {
    const { count } = await sb
      .from("workers")
      .select("id", { count: "exact", head: true })
      .neq("version", version)
      .not("worker_type", "eq", "android_mobile");
    outdated_workers = count || 0;
  }

  return NextResponse.json({
    message: `v${version} 릴리스 등록 완료 (${worker_type})`,
    release: data,
    outdated_workers,
  });
}
