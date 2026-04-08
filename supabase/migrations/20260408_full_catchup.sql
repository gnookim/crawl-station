-- ============================================================
-- CrawlStation 전체 누락 컬럼/테이블 일괄 마이그레이션
-- Supabase SQL Editor에서 전체 실행
-- ============================================================

-- ── 1. workers 테이블 누락 컬럼 ──────────────────────────────

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS hostname         text,
  ADD COLUMN IF NOT EXISTS python_version   text,
  ADD COLUMN IF NOT EXISTS version          text DEFAULT '0.0.0',
  ADD COLUMN IF NOT EXISTS registered_by    text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS registered_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS command          text CHECK (command IN ('stop','restart','update')),
  ADD COLUMN IF NOT EXISTS ip_address       text,
  ADD COLUMN IF NOT EXISTS current_task_id  text,
  ADD COLUMN IF NOT EXISTS current_keyword  text,
  ADD COLUMN IF NOT EXISTS current_type     text,
  ADD COLUMN IF NOT EXISTS total_processed  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_types    text[],
  ADD COLUMN IF NOT EXISTS block_status     text CHECK (block_status IN ('cooling','blocked','banned')),
  ADD COLUMN IF NOT EXISTS block_platform   text CHECK (block_platform IN ('naver','instagram')),
  ADD COLUMN IF NOT EXISTS block_level      integer CHECK (block_level IN (1,2,3)),
  ADD COLUMN IF NOT EXISTS blocked_until    timestamptz,
  ADD COLUMN IF NOT EXISTS block_count_today integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_test_result jsonb;

-- ── 2. worker_config 테이블 누락 컬럼 ────────────────────────

-- worker_config가 없으면 생성
CREATE TABLE IF NOT EXISTS worker_config (
  id                          text PRIMARY KEY DEFAULT 'global',
  ua_pool                     jsonb DEFAULT '[]',
  typing_speed_min            integer DEFAULT 80,
  typing_speed_max            integer DEFAULT 200,
  scroll_min                  integer DEFAULT 2,
  scroll_max                  integer DEFAULT 5,
  batch_size                  integer DEFAULT 30,
  batch_rest_seconds          integer DEFAULT 180,
  keyword_delay_min           integer DEFAULT 15,
  keyword_delay_max           integer DEFAULT 30,
  typo_probability            real DEFAULT 0.05,
  scroll_back_probability     real DEFAULT 0.1,
  proxy_url                   text DEFAULT '',
  network_type                text DEFAULT 'wifi',
  proxy_rotate                boolean DEFAULT false,
  tethering_carrier           text DEFAULT 'skt',
  tethering_auto_reconnect    boolean DEFAULT false,
  tethering_reconnect_interval text DEFAULT 'per_batch',
  daily_quota                 integer DEFAULT 500,
  daily_used                  integer DEFAULT 0,
  quota_reset_at              timestamptz DEFAULT now(),
  allowed_types               jsonb DEFAULT '[]',
  ai_auto_adjust              boolean DEFAULT true,
  decoy_probability           real DEFAULT 0.15,
  rest_hours                  integer[] DEFAULT '{3,4,5}',
  last_ai_adjustment          timestamptz,
  updated_at                  timestamptz DEFAULT now(),
  updated_by                  text DEFAULT 'system'
);

-- 이미 있으면 컬럼만 추가
ALTER TABLE worker_config
  ADD COLUMN IF NOT EXISTS proxy_url                   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS network_type                text DEFAULT 'wifi',
  ADD COLUMN IF NOT EXISTS proxy_rotate                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tethering_carrier           text DEFAULT 'skt',
  ADD COLUMN IF NOT EXISTS tethering_auto_reconnect    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tethering_reconnect_interval text DEFAULT 'per_batch',
  ADD COLUMN IF NOT EXISTS daily_quota                 integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS daily_used                  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_reset_at              timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS allowed_types               jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_auto_adjust              boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS decoy_probability           real DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS rest_hours                  integer[] DEFAULT '{3,4,5}',
  ADD COLUMN IF NOT EXISTS last_ai_adjustment          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at                  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by                  text DEFAULT 'system';

-- global config 기본값 upsert
INSERT INTO worker_config (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;

-- ── 3. crawl_requests 누락 컬럼 ──────────────────────────────

ALTER TABLE crawl_requests
  ADD COLUMN IF NOT EXISTS parent_id      uuid,
  ADD COLUMN IF NOT EXISTS scope          text,
  ADD COLUMN IF NOT EXISTS assigned_worker text;

-- ── 4. station_settings 테이블 ───────────────────────────────

CREATE TABLE IF NOT EXISTS station_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- ── 5. crawl_blocks 테이블 ───────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_blocks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   text        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  platform    text        NOT NULL CHECK (platform IN ('naver','instagram')),
  level       integer     NOT NULL CHECK (level IN (1,2,3)),
  block_type  text,
  detected_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolution  text
);

CREATE INDEX IF NOT EXISTS idx_crawl_blocks_worker   ON crawl_blocks(worker_id);
CREATE INDEX IF NOT EXISTS idx_crawl_blocks_detected ON crawl_blocks(detected_at DESC);

-- ── 6. crawl_metadata 테이블 ─────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_metadata (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id        text    NOT NULL,
  request_id       uuid,
  keyword          text,
  type             text,
  response_time_ms integer,
  result_count     integer DEFAULT 0,
  blocked          boolean DEFAULT false,
  captcha          boolean DEFAULT false,
  empty_result     boolean DEFAULT false,
  error_type       text,
  ua_used          text,
  ip_used          text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crawl_metadata_worker  ON crawl_metadata(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_metadata_created ON crawl_metadata(created_at DESC);

-- ── 7. ai_analysis_log 테이블 ────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id               uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  model            text  NOT NULL,
  trigger_reason   text,
  analysis         text,
  adjustments      jsonb,
  worker_ids       text[],
  metadata_count   integer,
  created_at       timestamptz DEFAULT now()
);

-- ── 8. daily_rank 테이블들 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_rank_schedules (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword      text    NOT NULL,
  type         text    NOT NULL DEFAULT 'rank_check',
  options      jsonb   DEFAULT '{}',
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_rank_urls (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword      text    NOT NULL,
  url          text    NOT NULL,
  title        text,
  rank         integer,
  checked_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_rank_dispatch_log (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatched_at timestamptz DEFAULT now(),
  schedule_count integer DEFAULT 0,
  request_ids  uuid[],
  note         text
);

-- ── 9. install_sessions 테이블 ───────────────────────────────

CREATE TABLE IF NOT EXISTS install_sessions (
  id                  text PRIMARY KEY,
  hostname            text,
  os_version          text,
  os_machine          text,
  installer_version   text,
  current_step        integer DEFAULT 0,
  current_step_name   text,
  status              text DEFAULT 'starting',
  failed_steps        jsonb DEFAULT '[]',
  error_log           text,
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── 10. instagram_accounts 테이블 ────────────────────────────
-- 기존 migrate/blocks의 구버전과 신버전(20260408) 통합

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username           text        NOT NULL UNIQUE,
  password           text        NOT NULL,
  is_active          boolean     DEFAULT true,
  status             text        DEFAULT 'active' CHECK (status IN ('active','cooling','blocked','banned')),
  session_state      jsonb       DEFAULT NULL,
  last_login_at      timestamptz,
  last_used_at       timestamptz,
  last_blocked_at    timestamptz,
  blocked_until      timestamptz,
  assigned_worker_id text        REFERENCES workers(id) ON DELETE SET NULL,
  login_count        integer     DEFAULT 0,
  block_count        integer     DEFAULT 0,
  note               text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON instagram_accounts(status, is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_worker ON instagram_accounts(assigned_worker_id);

-- ── 11. RPC 함수들 ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_daily_used(wid text)
RETURNS void AS $$
  UPDATE worker_config SET daily_used = daily_used + 1 WHERE id = wid;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION reset_daily_quota_if_needed(wid text)
RETURNS void AS $$
DECLARE
  kst_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  last_reset date;
BEGIN
  SELECT (quota_reset_at AT TIME ZONE 'Asia/Seoul')::date INTO last_reset
    FROM worker_config WHERE id = wid;
  IF last_reset IS NULL OR last_reset < kst_today THEN
    UPDATE worker_config SET daily_used = 0, quota_reset_at = now() WHERE id = wid;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_instagram_login(p_id uuid)
RETURNS void AS $$
  UPDATE instagram_accounts SET login_count = login_count + 1 WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION increment_instagram_block(p_id uuid)
RETURNS void AS $$
  UPDATE instagram_accounts SET block_count = block_count + 1 WHERE id = p_id;
$$ LANGUAGE sql;

-- ── 12. RLS 설정 ──────────────────────────────────────────────

ALTER TABLE station_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_metadata      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_accounts  ENABLE ROW LEVEL SECURITY;

-- service_role 전체 허용
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'station_settings'   AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON station_settings   USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crawl_blocks'       AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON crawl_blocks       USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crawl_metadata'     AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON crawl_metadata     USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_analysis_log'    AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON ai_analysis_log    USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'install_sessions'   AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON install_sessions   USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'instagram_accounts' AND policyname = 'instagram_accounts_service') THEN
    CREATE POLICY instagram_accounts_service ON instagram_accounts USING (true) WITH CHECK (true); END IF;
END $$;
