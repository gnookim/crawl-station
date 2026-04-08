import { NextResponse } from "next/server";

/**
 * 차단 관리 DB 마이그레이션
 * GET /api/migrate/blocks
 *
 * Supabase는 REST로 DDL 직접 실행 불가.
 * → manual_sql 반환 + Supabase SQL Editor 안내
 */

const MIGRATION_SQL = `
-- 1. workers 테이블 차단 컬럼 추가
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS block_status     TEXT    CHECK (block_status IN ('cooling','blocked','banned')),
  ADD COLUMN IF NOT EXISTS block_platform   TEXT    CHECK (block_platform IN ('naver','instagram')),
  ADD COLUMN IF NOT EXISTS block_level      INTEGER CHECK (block_level IN (1,2,3)),
  ADD COLUMN IF NOT EXISTS blocked_until    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS block_count_today INTEGER DEFAULT 0;

-- 2. 차단 이력 테이블
CREATE TABLE IF NOT EXISTS crawl_blocks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id   TEXT        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  platform    TEXT        NOT NULL CHECK (platform IN ('naver','instagram')),
  level       INTEGER     NOT NULL CHECK (level IN (1,2,3)),
  block_type  TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution  TEXT
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_crawl_blocks_worker   ON crawl_blocks(worker_id);
CREATE INDEX IF NOT EXISTS idx_crawl_blocks_detected ON crawl_blocks(detected_at DESC);

-- 4. instagram_accounts 테이블 (2단계 대비)
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  username         TEXT        NOT NULL UNIQUE,
  password_enc     TEXT        NOT NULL,
  assigned_worker  TEXT        REFERENCES workers(id) ON DELETE SET NULL,
  status           TEXT        DEFAULT 'active' CHECK (status IN ('active','cooling','blocked','banned')),
  session_json     TEXT,
  last_login_at    TIMESTAMPTZ,
  session_valid    BOOLEAN     DEFAULT FALSE,
  block_count      INTEGER     DEFAULT 0,
  last_blocked_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insta_accounts_worker ON instagram_accounts(assigned_worker);
CREATE INDEX IF NOT EXISTS idx_insta_accounts_status ON instagram_accounts(status);
`.trim();

export async function GET() {
  // workers 테이블에 컬럼 존재 여부 확인 (간접적으로)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;

  // workers 테이블 샘플 조회로 컬럼 존재 확인
  const checkRes = await fetch(`${url}/rest/v1/workers?select=block_status,block_platform,block_level,blocked_until,block_count_today&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  const alreadyMigrated = checkRes.ok;

  if (alreadyMigrated) {
    // crawl_blocks 테이블도 확인
    const blocksRes = await fetch(`${url}/rest/v1/crawl_blocks?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const instaRes = await fetch(`${url}/rest/v1/instagram_accounts?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    return NextResponse.json({
      ok: true,
      workers_columns: true,
      crawl_blocks_table: blocksRes.ok,
      instagram_accounts_table: instaRes.ok,
      message: "이미 마이그레이션 완료",
    });
  }

  return NextResponse.json({
    ok: false,
    workers_columns: false,
    message: "마이그레이션 필요 — Supabase SQL Editor에서 migration_sql을 실행해주세요.",
    migration_sql: MIGRATION_SQL,
  }, { status: 200 });
}
