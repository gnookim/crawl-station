-- Instagram 계정 관리 테이블
CREATE TABLE IF NOT EXISTS instagram_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    password text NOT NULL,
    is_active boolean DEFAULT true,
    status text DEFAULT 'active',         -- active | blocked | cooling | banned
    session_state jsonb DEFAULT NULL,     -- playwright storageState (cookies + localStorage)
    last_login_at timestamptz DEFAULT NULL,
    last_used_at timestamptz DEFAULT NULL,
    last_blocked_at timestamptz DEFAULT NULL,
    blocked_until timestamptz DEFAULT NULL,
    assigned_worker_id text DEFAULT NULL, -- 특정 워커 전용 배정 (null = 공용)
    login_count integer DEFAULT 0,
    block_count integer DEFAULT 0,
    note text DEFAULT NULL,               -- 메모 (계정 용도 등)
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON instagram_accounts(status, is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_worker ON instagram_accounts(assigned_worker_id);

-- RLS (Station API 키로 접근하므로 service_role만 허용)
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY instagram_accounts_service ON instagram_accounts
    USING (true) WITH CHECK (true);
