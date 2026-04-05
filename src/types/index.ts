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
  command: "stop" | "restart" | "update" | null;
  verified_at: string | null;
  last_test_result: Record<string, unknown> | null;
  created_at: string;
  is_active?: boolean;
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
  parent_id: string | null;
  scope: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type NetworkType = "wifi" | "tethering" | "proxy_static" | "proxy_rotate";
export type TetheringCarrier = "skt" | "kt" | "lgu" | "other";
export type TetheringReconnectInterval = "per_batch" | "3min" | "5min" | "10min";

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
  proxy_url: string;
  network_type: NetworkType;
  proxy_rotate: boolean;
  tethering_carrier: TetheringCarrier;
  tethering_auto_reconnect: boolean;
  tethering_reconnect_interval: TetheringReconnectInterval;
  daily_quota: number;
  daily_used: number;
  quota_reset_at: string;
  updated_at: string;
  updated_by: string;
}

export interface ConnectedApp {
  id: string;
  name: string;
  description: string | null;
  api_key: string;
  is_active: boolean;
  total_requests: number;
  last_used_at: string | null;
  created_at: string;
}

export type CrawlType =
  | "kin_analysis"
  | "blog_crawl"
  | "blog_serp"
  | "rank_check"
  | "deep_analysis"
  | "area_analysis"
  | "daily_rank"
  | "instagram_profile";

export const CRAWL_TYPE_LABELS: Record<string, string> = {
  kin_analysis: "지식인 분석",
  blog_crawl: "블로그 크롤링",
  blog_serp: "블로그 순위",
  rank_check: "통합검색 순위",
  deep_analysis: "심화 분석",
  area_analysis: "영역 분석",
  daily_rank: "일일 순위",
  instagram_profile: "인스타 프로필",
};

/** 타입별 기본 우선순위 (높을수록 먼저 처리) */
export const PRIORITY_BY_TYPE: Record<string, number> = {
  deep_analysis: 10,
  kin_analysis: 5,
  blog_crawl: 5,
  blog_serp: 5,
  area_analysis: 5,
  instagram_profile: 5,
  rank_check: 1,
  daily_rank: 1,
};

/** 작업 카테고리 — 탭 구분용 */
export type CrawlCategory = "all" | "naver" | "instagram";

export const CRAWL_CATEGORIES: { key: CrawlCategory; label: string; types: string[] }[] = [
  { key: "all", label: "전체", types: [] },
  {
    key: "naver",
    label: "네이버",
    types: ["kin_analysis", "blog_crawl", "blog_serp", "rank_check", "deep_analysis", "area_analysis", "daily_rank"],
  },
  {
    key: "instagram",
    label: "인스타그램",
    types: ["instagram_profile"],
  },
];

export function getCrawlCategory(type: string): CrawlCategory {
  if (CRAWL_CATEGORIES[2].types.includes(type)) return "instagram";
  return "naver";
}

/** 워커 오프라인 판정 임계값 (ms) — heartbeat 10초 간격 기준, 여유 있게 30초 */
export const WORKER_ONLINE_THRESHOLD_MS = 30_000;

export const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  assigned: "할당됨",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
};
