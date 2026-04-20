-- 모바일 워커 지원 컬럼 추가

-- workers: 워커 타입 + 모바일 전용 필드
ALTER TABLE workers ADD COLUMN IF NOT EXISTS worker_type    text    DEFAULT 'pc';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS carrier        text    DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS battery_level  integer DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS battery_charging boolean DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS temperature    float   DEFAULT NULL;

-- 기존 PC 워커는 worker_type = 'pc' 로 일괄 설정
UPDATE workers SET worker_type = 'pc' WHERE worker_type IS NULL OR worker_type = 'pc';

-- crawl_requests: 디바이스 타입 구분 (pc / mobile)
ALTER TABLE crawl_requests ADD COLUMN IF NOT EXISTS device_type text DEFAULT 'pc';

COMMENT ON COLUMN workers.worker_type     IS 'pc | android_mobile';
COMMENT ON COLUMN workers.carrier         IS 'SKT | KT | LGU+';
COMMENT ON COLUMN workers.battery_level   IS '배터리 잔량 (%)';
COMMENT ON COLUMN workers.battery_charging IS '충전 중 여부';
COMMENT ON COLUMN workers.temperature     IS 'CPU 온도 (°C)';
COMMENT ON COLUMN crawl_requests.device_type IS 'pc | mobile — 크롤 대상 디바이스 타입';
