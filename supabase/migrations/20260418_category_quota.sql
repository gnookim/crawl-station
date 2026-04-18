-- 카테고리별 일일 한도 컬럼 추가 (v0.9.43/v0.9.44)
ALTER TABLE worker_config
  ADD COLUMN IF NOT EXISTS daily_quota_naver      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_quota_instagram  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_used_naver       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_used_instagram   integer DEFAULT 0;

-- 카테고리별 사용량 증가 RPC
CREATE OR REPLACE FUNCTION increment_daily_used_cat(wid text, cat text)
RETURNS void AS $$
BEGIN
  IF cat = 'naver' THEN
    UPDATE worker_config
    SET daily_used = daily_used + 1,
        daily_used_naver = daily_used_naver + 1
    WHERE id = wid;
  ELSIF cat = 'instagram' THEN
    UPDATE worker_config
    SET daily_used = daily_used + 1,
        daily_used_instagram = daily_used_instagram + 1
    WHERE id = wid;
  ELSE
    UPDATE worker_config
    SET daily_used = daily_used + 1
    WHERE id = wid;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 전체 카테고리 카운터 초기화 RPC (KST 자정 리셋)
CREATE OR REPLACE FUNCTION reset_daily_quotas(wid text)
RETURNS void AS $$
  UPDATE worker_config
  SET daily_used = 0,
      daily_used_naver = 0,
      daily_used_instagram = 0,
      quota_reset_at = now()
  WHERE id = wid;
$$ LANGUAGE sql;
