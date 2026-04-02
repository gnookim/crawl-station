-- AI 기반 크롤링 회피 고도화 시스템

-- 크롤링 메타데이터 (워커가 매 작업마다 기록)
CREATE TABLE IF NOT EXISTS crawl_metadata (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id text NOT NULL,
    request_id uuid,
    keyword text,
    type text,
    response_time_ms integer,        -- 검색 응답 시간
    result_count integer DEFAULT 0,  -- 검색 결과 수
    blocked boolean DEFAULT false,   -- 캡챠/차단 감지
    captcha boolean DEFAULT false,   -- 캡챠 발생
    empty_result boolean DEFAULT false, -- 결과 0건 (의심)
    error_type text,                 -- 에러 유형
    ua_used text,                    -- 사용된 User-Agent
    ip_used text,                    -- 사용된 IP
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crawl_metadata_worker ON crawl_metadata(worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_metadata_created ON crawl_metadata(created_at DESC);

-- AI 분석 결과 로그
CREATE TABLE IF NOT EXISTS ai_analysis_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model text NOT NULL,             -- haiku, sonnet, opus
    trigger_reason text,             -- periodic, block_detected, manual
    analysis text,                   -- AI 분석 결과
    adjustments jsonb,               -- 적용된 config 변경 내역
    worker_ids text[],               -- 분석 대상 워커
    metadata_count integer,          -- 분석에 사용된 메타데이터 수
    created_at timestamptz DEFAULT now()
);

-- worker_config에 AI 자동 조정 관련 필드 추가
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS ai_auto_adjust boolean DEFAULT true;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS decoy_probability real DEFAULT 0.15;
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS rest_hours integer[] DEFAULT '{3,4,5}';
ALTER TABLE worker_config ADD COLUMN IF NOT EXISTS last_ai_adjustment timestamptz;
