-- Instagram 계정에 이메일·전화번호·관리팀·생성자 컬럼 추가
ALTER TABLE instagram_accounts
    ADD COLUMN IF NOT EXISTS email    text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS phone    text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS team     text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS creator  text DEFAULT NULL;
