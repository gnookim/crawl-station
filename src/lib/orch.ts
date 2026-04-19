// @orch-std: orch_ts v1.0.0
// Orchestrator 공통 헬퍼
// 복사 위치: src/lib/orch.ts (각 앱에 그대로 복사)
// APP_NAME은 .orch-app-name 파일과 동일한 값 사용

import { createClient } from '@supabase/supabase-js'

const APP_NAME = 'crawl-station'  // ← 앱 이름으로 변경

const orchClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 이벤트 발행 (fire-and-forget, 오류는 무시)
export async function orchEvent(
  event_type: string,
  payload?: Record<string, unknown>
) {
  try {
    await orchClient().from('orch_events').insert({ source_app: APP_NAME, event_type, payload })
  } catch {}
}

// 헬스 상태 업데이트
export async function orchHealth(status: 'ok' | 'warn' | 'error') {
  try {
    await orchClient().from('orch_services').update({
      // health_status 컬럼 제거됨
      last_seen_at: new Date().toISOString(),
    }).eq('name', APP_NAME)
  } catch {}
}

// 이슈 신고
export async function orchIssue(params: {
  type: 'bug' | 'feature' | 'question'
  title: string
  description?: string
  reporter?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
}) {
  await orchClient().from('orch_issues').insert({
    service_name: APP_NAME,
    ...params,
  })
}
