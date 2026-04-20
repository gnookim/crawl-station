-- 모바일 크롤 결과 테이블 + worker_releases worker_type 분리

-- ── worker_releases: worker_type 컬럼 추가 ────────────────
ALTER TABLE worker_releases
    ADD COLUMN IF NOT EXISTS worker_type text DEFAULT 'pc';

COMMENT ON COLUMN worker_releases.worker_type IS 'pc | android_mobile — 해당 릴리즈 대상 워커 타입';

-- 기존 릴리즈는 모두 pc용
UPDATE worker_releases SET worker_type = 'pc' WHERE worker_type IS NULL;

-- ── crawl_results: 모바일 전용 컬럼 추가 ─────────────────
ALTER TABLE crawl_results
    ADD COLUMN IF NOT EXISTS worker_id       text,
    ADD COLUMN IF NOT EXISTS device_type     text DEFAULT 'pc',
    ADD COLUMN IF NOT EXISTS serp_environment text,
    ADD COLUMN IF NOT EXISTS parsed_data     jsonb,
    ADD COLUMN IF NOT EXISTS raw_html_url    text,
    ADD COLUMN IF NOT EXISTS screenshot_url  text,
    ADD COLUMN IF NOT EXISTS public_ip       text,
    ADD COLUMN IF NOT EXISTS user_agent      text,
    ADD COLUMN IF NOT EXISTS keyword_id      uuid REFERENCES keywords(id) ON DELETE SET NULL;

COMMENT ON COLUMN crawl_results.device_type      IS 'pc | mobile';
COMMENT ON COLUMN crawl_results.serp_environment IS '구모통 | 신모통 | 스마트블록';
COMMENT ON COLUMN crawl_results.parsed_data      IS '핸들러 반환 전체 결과 JSON';
COMMENT ON COLUMN crawl_results.raw_html_url     IS 'Supabase Storage raw HTML URL';
COMMENT ON COLUMN crawl_results.screenshot_url   IS 'Supabase Storage 스크린샷 URL';

-- ── mobile-crawl Storage 버킷 생성 ────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'mobile-crawl',
    'mobile-crawl',
    true,
    52428800,  -- 50MB
    ARRAY['text/html', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- 버킷 공개 읽기 정책
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='mobile-crawl public read'
  ) THEN
    CREATE POLICY "mobile-crawl public read"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'mobile-crawl');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='mobile-crawl service insert'
  ) THEN
    CREATE POLICY "mobile-crawl service insert"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'mobile-crawl');
  END IF;
END $$;
