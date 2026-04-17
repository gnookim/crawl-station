import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart 형식이 필요합니다." }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file)              return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "JPG/PNG/GIF/WEBP만 허용됩니다." }, { status: 400 });
  if (file.size > MAX_SIZE)         return NextResponse.json({ error: "5MB 이하 파일만 첨부할 수 있습니다." }, { status: 400 });

  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buf  = await file.arrayBuffer();

  const sb = createServerClient();
  const { error } = await sb.storage
    .from("feedback-images")
    .upload(path, buf, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = sb.storage.from("feedback-images").getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
