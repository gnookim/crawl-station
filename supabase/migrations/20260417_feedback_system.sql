-- 피드백 & 요청 시스템 테이블

CREATE TABLE IF NOT EXISTS feedback_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             varchar(20)  NOT NULL DEFAULT 'feature',
  priority         varchar(10)  NOT NULL DEFAULT 'medium',
  title            varchar(200) NOT NULL,
  description      text         NOT NULL,
  status           varchar(20)  NOT NULL DEFAULT 'pending',
  submitted_by     varchar(100),
  user_id          uuid,
  admin_reply      text,
  reply_image_urls text[]       DEFAULT '{}',
  replied_at       timestamptz,
  replied_by       uuid,
  completed_at     timestamptz,
  image_urls       text[]       DEFAULT '{}',
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_requests(status);
ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_all" ON feedback_requests;
CREATE POLICY "feedback_all" ON feedback_requests FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
  user_id     uuid,
  author_name varchar(100),
  is_admin    boolean NOT NULL DEFAULT false,
  body        text    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_comments_fid ON feedback_comments(feedback_id);
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_comments_all" ON feedback_comments;
CREATE POLICY "feedback_comments_all" ON feedback_comments FOR ALL USING (true);
