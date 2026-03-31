export interface Worker {
  id: string;
  name: string | null;
  os: string | null;
  hostname: string | null;
  python_version: string | null;
  status: "online" | "idle" | "crawling" | "blocked" | "offline";
  last_seen: string | null;
  ip_address: string | null;
  current_task_id: string | null;
  current_keyword: string | null;
  current_type: string | null;
  total_processed: number;
  error_count: number;
  blocked_until: string | null;
  registered_at: string;
  version: string;
  registered_by: "auto" | "manual";
  created_at: string;
}

export interface WorkerRelease {
  id: string;
  version: string;
  changelog: string;
  files: Record<string, string>;
  is_latest: boolean;
  created_at: string;
}

export interface CrawlRequest {
  id: string;
  type: string;
  keyword: string;
  options: Record<string, unknown> | null;
  status: "pending" | "assigned" | "running" | "completed" | "failed";
  assigned_worker: string | null;
  priority: number;
  callback_url: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkerConfig {
  id: string;
  ua_pool: string[];
  typing_speed_min: number;
  typing_speed_max: number;
  scroll_min: number;
  scroll_max: number;
  batch_size: number;
  batch_rest_seconds: number;
  keyword_delay_min: number;
  keyword_delay_max: number;
  typo_probability: number;
  scroll_back_probability: number;
  updated_at: string;
  updated_by: string;
}

export type CrawlType =
  | "kin_analysis"
  | "blog_crawl"
  | "blog_serp"
  | "rank_check";

export const CRAWL_TYPE_LABELS: Record<string, string> = {
  kin_analysis: "지식인 분석",
  blog_crawl: "블로그 크롤링",
  blog_serp: "블로그 순위",
  rank_check: "통합검색 순위",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  assigned: "할당됨",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
};
