-- workers 테이블에 설치 장소 + 메모 컬럼 추가
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS note     text;
