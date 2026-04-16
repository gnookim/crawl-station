/** 카테고리별 헬스 체크 정의 — 무엇을 어떻게 검사하는지 명시 */
export const HEALTH_CHECK_DEFS = {
  naver: {
    label: "네이버",
    method: "blog_serp",
    target: "키워드 '블로그'",
    pass: "결과 1개 이상 수집",
    fail: "결과 0개 / 차단 감지 / 타임아웃",
    timeout_sec: 30,
  },
  instagram: {
    label: "인스타그램",
    method: "instagram_profile",
    target: "계정 @instagram",
    pass: "팔로워 수 수집 성공",
    fail: "로그인 필요 / 차단 / 수집 불가",
    timeout_sec: 30,
  },
  oclick: {
    label: "Oclick",
    method: "oclick_sync",
    target: "전체 상품 목록",
    pass: "상품 1개 이상 수집",
    fail: "API 연결 실패 / 상품 0개",
    timeout_sec: 15,
  },
} as const;

export type HealthCat = keyof typeof HEALTH_CHECK_DEFS;

/** 헬스 상태 4단계 */
export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

/** 테스트 통과 후 이 시간(h)이 지나면 degraded로 간주 */
export const HEALTH_STALE_HOURS = 24;

/** test_results 항목 하나로 헬스 상태 파생 */
export function getHealthState(
  testResult: { ok: boolean; at: string; error?: string } | null | undefined
): HealthState {
  if (!testResult) return "unknown";
  if (!testResult.ok) return "unhealthy";
  const ageHours = (Date.now() - new Date(testResult.at).getTime()) / 3_600_000;
  if (ageHours > HEALTH_STALE_HOURS) return "degraded";
  return "healthy";
}

export const HEALTH_STATE_LABEL: Record<HealthState, string> = {
  healthy:   "정상",
  degraded:  "만료",
  unhealthy: "실패",
  unknown:   "미테스트",
};

/** ON 버튼 활성화 조건: healthy 상태만 허용 */
export function canForceOn(state: HealthState): boolean {
  return state === "healthy";
}

export const HEALTH_DOT_CLS: Record<HealthState, string> = {
  healthy:   "bg-green-500",
  degraded:  "bg-yellow-400",
  unhealthy: "bg-red-400",
  unknown:   "bg-gray-300",
};
