-- 워커 검증 상태
ALTER TABLE workers ADD COLUMN IF NOT EXISTS verified_at timestamptz DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS last_test_result jsonb DEFAULT NULL;
