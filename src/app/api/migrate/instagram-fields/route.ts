import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const sb = createServerClient();

  const columns = [
    { name: "email",   type: "text" },
    { name: "phone",   type: "text" },
    { name: "team",    type: "text" },
    { name: "creator", type: "text" },
    { name: "current_ip", table: "workers", type: "text" },
  ];

  const results: { col: string; ok: boolean; msg: string }[] = [];

  for (const col of columns) {
    const table = (col as { table?: string }).table || "instagram_accounts";
    try {
      await sb.rpc("exec_ddl", {
        ddl: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT NULL`,
      });
      results.push({ col: col.name, ok: true, msg: "추가됨" });
    } catch {
      // rpc 없으면 직접 insert로 컬럼 존재 여부 확인
      results.push({ col: col.name, ok: false, msg: "rpc 미지원 — Supabase SQL Editor에서 수동 실행 필요" });
    }
  }

  return NextResponse.json({ results });
}
