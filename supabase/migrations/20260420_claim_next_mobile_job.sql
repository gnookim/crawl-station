-- claim_next_mobile_job: 모바일 워커 작업 atomic claim
-- crawl_requests 테이블에서 device_type='mobile' 인 pending 작업을 경합 없이 claim

CREATE OR REPLACE FUNCTION claim_next_mobile_job(
    p_worker_id    text,
    p_capabilities text[]
)
RETURNS SETOF crawl_requests
LANGUAGE plpgsql
AS $$
DECLARE
    v_job crawl_requests;
BEGIN
    SELECT * INTO v_job
    FROM crawl_requests
    WHERE status       = 'pending'
      AND device_type  = 'mobile'
      AND (type = ANY(p_capabilities) OR p_capabilities IS NULL OR array_length(p_capabilities, 1) = 0)
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    UPDATE crawl_requests
    SET status          = 'assigned',
        assigned_worker = p_worker_id,
        started_at      = NOW()
    WHERE id = v_job.id;

    v_job.status          := 'assigned';
    v_job.assigned_worker := p_worker_id;
    v_job.started_at      := NOW();

    RETURN NEXT v_job;
END;
$$;

COMMENT ON FUNCTION claim_next_mobile_job IS '모바일 워커가 crawl_requests에서 device_type=mobile 작업을 atomic하게 claim';
