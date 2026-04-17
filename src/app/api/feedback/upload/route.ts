import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/** POST /api/feedback/upload — 이미지 → Supabase Storage */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "multipart 형식이 필요합니다." }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "JPG/PNG/GIF/WEBP만 허용합니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "5MB 이하 파일만 첨부할 수 있습니다." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const sb = createServerClient();
  const { error } = await sb.storage
    .from("feedback-images")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = sb.storage.from("feedback-images").getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
