import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import crypto from "crypto";

/**
 * 연결된 앱 관리 API
 *
 * GET    /api/apps          — 앱 목록
 * POST   /api/apps          — 앱 등록 + API 키 발급
 * PATCH  /api/apps?id=xxx   — 앱 수정 (활성/비활성)
 * DELETE /api/apps?id=xxx   — 앱 삭제
 */

function generateApiKey(): string {
  return `cs_${crypto.randomBytes(24).toString("hex")}`;
}

export async function GET() {
  const sb = createServerClient();
  const { data, error } = await sb
    .from("connected_apps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apps: data || [] });
}

export async function POST(request: NextRequest) {
  const sb = createServerClient();
  const body = await request.json();
  const { name, description } = body;

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "앱 이름이 필요합니다" },
      { status: 400 }
    );
  }

  const apiKey = generateApiKey();

  const { data, error } = await sb
    .from("connected_apps")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      api_key: apiKey,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `등록 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: `앱 "${name}" 등록 완료`,
    app: data,
    api_key: apiKey,
  });
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const sb = createServerClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { error } = await sb
    .from("connected_apps")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "수정 완료" });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }

  const sb = createServerClient();
  const { error } = await sb.from("connected_apps").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "삭제 완료" });
}
