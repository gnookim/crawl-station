-- install_sessions: 모바일 워커 설치 지원 컬럼 추가
ALTER TABLE install_sessions
  ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'pc',
  ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 9;
