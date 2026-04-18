-- Instagram 계정별 수집 주기 스케줄 컬럼 추가
ALTER TABLE instagram_accounts
  ADD COLUMN IF NOT EXISTS check_interval_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS next_check_at        timestamptz DEFAULT NULL;
