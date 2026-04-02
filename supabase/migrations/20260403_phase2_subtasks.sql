-- Phase 2: 서브태스크 분할 — deep_analysis를 영역별로 분산
ALTER TABLE crawl_requests ADD COLUMN IF NOT EXISTS parent_id uuid DEFAULT NULL;
ALTER TABLE crawl_requests ADD COLUMN IF NOT EXISTS scope text DEFAULT NULL;

-- 인덱스 (서브태스크 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_crawl_requests_parent ON crawl_requests(parent_id) WHERE parent_id IS NOT NULL;
