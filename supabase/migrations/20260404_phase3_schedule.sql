-- Phase 3: 일일 순위 스케줄 매니저

-- 스케줄 설정
CREATE TABLE IF NOT EXISTS daily_rank_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    is_active boolean DEFAULT true,
    worker_count integer DEFAULT 2,
    slots_per_day integer DEFAULT 4,
    slot_hours integer[] DEFAULT '{6,10,14,18}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 순위 체크 대상 URL 목록
CREATE TABLE IF NOT EXISTS daily_rank_urls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid REFERENCES daily_rank_schedules(id) ON DELETE CASCADE,
    url text NOT NULL,
    keyword text NOT NULL,
    memo text,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_rank_urls_schedule ON daily_rank_urls(schedule_id);

-- 디스패치 로그 (중복 방지)
CREATE TABLE IF NOT EXISTS daily_rank_dispatch_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id uuid REFERENCES daily_rank_schedules(id) ON DELETE CASCADE,
    dispatch_date date NOT NULL,
    slot_hour integer NOT NULL,
    tasks_created integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(schedule_id, dispatch_date, slot_hour)
);
