-- Phase 1: 분배 정책 — 워커 일일 할당량
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS daily_quota integer DEFAULT 500;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS daily_used integer DEFAULT 0;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS quota_reset_at timestamptz DEFAULT now();

-- Race condition 방지용 atomic increment 함수
CREATE OR REPLACE FUNCTION increment_daily_used(wid text)
RETURNS void AS $$
  UPDATE worker_config SET daily_used = daily_used + 1 WHERE id = wid;
$$ LANGUAGE sql;

-- 자정 리셋 함수 (KST 기준)
CREATE OR REPLACE FUNCTION reset_daily_quota_if_needed(wid text)
RETURNS void AS $$
DECLARE
  kst_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  last_reset date;
BEGIN
  SELECT (quota_reset_at AT TIME ZONE 'Asia/Seoul')::date INTO last_reset
    FROM worker_config WHERE id = wid;
  IF last_reset IS NULL OR last_reset < kst_today THEN
    UPDATE worker_config
      SET daily_used = 0, quota_reset_at = now()
      WHERE id = wid;
  END IF;
END;
$$ LANGUAGE plpgsql;
