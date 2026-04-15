-- 워커 현재 IP 주소 컬럼 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS current_ip text DEFAULT NULL;
