-- ============================================================
-- daily_rank_* 테이블 스키마 수정
-- 기존 잘못된 스키마를 API 실제 사용 구조로 재생성
-- ============================================================

-- 기존 테이블 삭제 (데이터 없음)
DROP TABLE IF EXISTS daily_rank_dispatch_log;
DROP TABLE IF EXISTS daily_rank_urls;
DROP TABLE IF EXISTS daily_rank_schedules;

-- ── daily_rank_schedules ──────────────────────────────────
CREATE TABLE daily_rank_schedules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  worker_count integer     NOT NULL DEFAULT 2,
  slots_per_day integer    NOT NULL DEFAULT 4,
  slot_hours   integer[]   NOT NULL DEFAULT '{6,10,14,18}',
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── daily_rank_urls ───────────────────────────────────────
CREATE TABLE daily_rank_urls (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  uuid        NOT NULL REFERENCES daily_rank_schedules(id) ON DELETE CASCADE,
  keyword      text        NOT NULL,
  url          text        NOT NULL,
  memo         text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_daily_rank_urls_schedule ON daily_rank_urls(schedule_id);

-- ── daily_rank_dispatch_log ───────────────────────────────
CREATE TABLE daily_rank_dispatch_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id    uuid        NOT NULL REFERENCES daily_rank_schedules(id) ON DELETE CASCADE,
  dispatch_date  date        NOT NULL,
  slot_hour      integer     NOT NULL,
  tasks_created  integer     NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (schedule_id, dispatch_date, slot_hour)
);

CREATE INDEX idx_daily_rank_dispatch_schedule ON daily_rank_dispatch_log(schedule_id, dispatch_date DESC);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE daily_rank_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_rank_urls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_rank_dispatch_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_rank_schedules' AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON daily_rank_schedules USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_rank_urls' AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON daily_rank_urls USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_rank_dispatch_log' AND policyname = 'service_all') THEN
    CREATE POLICY service_all ON daily_rank_dispatch_log USING (true) WITH CHECK (true); END IF;
END $$;
