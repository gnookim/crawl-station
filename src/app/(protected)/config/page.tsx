"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Worker } from "@/types";
import { CRAWL_TYPE_LABELS, WORKER_ONLINE_THRESHOLD_MS } from "@/types";

// ── Tab ──────────────────────────────────────────────────────────────────────
type Tab = "settings" | "analytics" | "blocks" | "logs";

// ── Local Types ───────────────────────────────────────────────────────────────
interface GlobalConfig {
  id: string;
  batch_size: number;
  batch_rest_seconds: number;
  keyword_delay_min: number;
  keyword_delay_max: number;
  typo_probability: number;
  scroll_back_probability: number;
  proxy_url: string;
  network_type: string;
  ua_pool: string[];
  typing_speed_min: number;
  typing_speed_max: number;
  scroll_min: number;
  scroll_max: number;
  rest_hours: number[];
}

interface MetaRow {
  worker_id: string;
  keyword: string | null;
  type: string | null;
  response_time_ms: number | null;
  result_count: number;
  blocked: boolean;
  captcha: boolean;
  empty_result: boolean;
  error_type: string | null;
  created_at: string;
}

interface BlockEvent {
  id: string;
  worker_id: string;
  platform: string;
  level: number;
  block_type: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

interface AILog {
  id: string;
  created_at: string;
  trigger_reason: string;
  model: string;
  analysis: string;
  adjustments: Record<string, unknown> | null;
  platform: string | null;
}

interface QueueItem {
  id: string;
  type: string;
  keyword: string;
  status: string;
  assigned_worker: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const NAVER_TYPES = new Set(["kin_analysis","blog_crawl","blog_serp","rank_check","deep_analysis","area_analysis","daily_rank"]);
const INSTA_TYPES = new Set(["instagram_profile"]);

function getCategory(type: string | null): "naver" | "instagram" | "oclick" | "기타" {
  if (!type) return "기타";
  if (NAVER_TYPES.has(type)) return "naver";
  if (INSTA_TYPES.has(type)) return "instagram";
  if (type.startsWith("oclick")) return "oclick";
  return "기타";
}

function calcRisk(worker: Worker, blocks: BlockEvent[]): number {
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recent = blocks.filter(b => b.worker_id === worker.id && new Date(b.detected_at).getTime() > sevenDaysAgo);
  const errorRate = worker.total_processed > 0 ? (worker.error_count / worker.total_processed) * 100 : 0;
  return Math.min(100, Math.max(0,
    recent.length * 20 +
    errorRate * 1 +
    (worker.block_level || 0) * 15 -
    (worker.verified_at ? 10 : 0)
  ));
}

function riskBadge(score: number): { label: string; color: string; bg: string; border: string } {
  if (score <= 30) return { label: "안전", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" };
  if (score <= 60) return { label: "주의", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" };
  if (score <= 80) return { label: "위험", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" };
  return { label: "긴급", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

function fmtMs(ms: number): string {
  if (ms >= 60000) return `${Math.round(ms / 60000)}분`;
  return `${Math.round(ms / 1000)}초`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>("settings");

  const TABS: { key: Tab; label: string }[] = [
    { key: "settings",  label: "설정" },
    { key: "analytics", label: "분석" },
    { key: "blocks",    label: "차단 분석" },
    { key: "logs",      label: "로그" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">크롤링 전략 센터</h2>
        <p className="text-xs text-gray-400 mt-0.5">설정 · 분석 · 차단 · 로그</p>
      </div>

      {/* 탭 바 */}
      <div className="flex gap-0.5 border-b border-gray-200 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "settings"  && <SettingsTab />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "blocks"    && <BlocksTab />}
      {tab === "logs"      && <LogsTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 탭: 설정
// ══════════════════════════════════════════════════════════════════════════════
function SettingsTab() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savedGlobal, setSavedGlobal] = useState(false);

  const loadGlobal = useCallback(async () => {
    const res = await fetch("/api/config");
    const data = await res.json();
    setGlobalConfig(data.config);
  }, []);

  useEffect(() => { loadGlobal(); }, [loadGlobal]);

  async function saveGlobal() {
    if (!globalConfig) return;
    setSavingGlobal(true);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(globalConfig),
    });
    setSavingGlobal(false);
    setSavedGlobal(true);
    setTimeout(() => setSavedGlobal(false), 2000);
  }

  const updateGlobal = (key: string, value: unknown) => {
    if (!globalConfig) return;
    setGlobalConfig({ ...globalConfig, [key]: value });
  };

  if (!globalConfig) return <div className="text-gray-400 text-sm">로딩 중...</div>;

  return (
    <>
      <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-md mb-4">
        워커별 네트워크·할당량·타입 설정은{" "}
        <a href="/workers" className="underline">워커 관리</a> 페이지에서 관리합니다.
      </p>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">글로벌 크롤링 설정</h3>
          <p className="text-xs text-gray-400">모든 워커에 공통 적용되는 속도/행동 설정</p>
        </div>
        <button
          onClick={saveGlobal}
          disabled={savingGlobal}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50 ${
            savedGlobal ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {savedGlobal ? "저장됨" : savingGlobal ? "저장 중..." : "글로벌 설정 저장"}
        </button>
      </div>

      <Section title="크롤링 속도" desc="키워드 간 딜레이, 배치 크기, 휴식 시간">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput label="키워드 딜레이 (최소 초)" value={globalConfig.keyword_delay_min} onChange={(v) => updateGlobal("keyword_delay_min", v)} min={5} max={120} />
          <NumberInput label="키워드 딜레이 (최대 초)" value={globalConfig.keyword_delay_max} onChange={(v) => updateGlobal("keyword_delay_max", v)} min={10} max={300} />
          <NumberInput label="배치 크기 (N개 후 휴식)" value={globalConfig.batch_size} onChange={(v) => updateGlobal("batch_size", v)} min={5} max={100} />
          <NumberInput label="배치 휴식 (초)" value={globalConfig.batch_rest_seconds} onChange={(v) => updateGlobal("batch_rest_seconds", v)} min={30} max={600} />
        </div>
      </Section>

      <Section title="새벽 휴식" desc="활성화하면 지정한 시간대(KST)에 워커가 작업을 멈춥니다.">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              const enabled = (globalConfig.rest_hours || []).length > 0;
              updateGlobal("rest_hours", enabled ? [] : [3, 4, 5]);
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              (globalConfig.rest_hours || []).length > 0 ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              (globalConfig.rest_hours || []).length > 0 ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
          <span className="text-sm text-gray-700">
            {(globalConfig.rest_hours || []).length > 0 ? "활성화" : "비활성화 (24시간 운행)"}
          </span>
        </div>
        {(globalConfig.rest_hours || []).length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 24 }, (_, h) => {
                const active = (globalConfig.rest_hours || []).includes(h);
                return (
                  <button
                    key={h}
                    onClick={() => {
                      const current = globalConfig.rest_hours || [];
                      updateGlobal("rest_hours", active ? current.filter((x) => x !== h) : [...current, h].sort((a, b) => a - b));
                    }}
                    className={`w-10 py-1 text-xs rounded border transition-colors ${
                      active ? "bg-indigo-600 text-white border-indigo-600 font-medium" : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              휴식 시간대: {(globalConfig.rest_hours || []).map((h) => `${h}시`).join(", ")}
            </p>
          </>
        )}
      </Section>

      <Section title="사람 흉내 설정" desc="타이핑 속도, 스크롤, 오타 등 자연스러운 행동 패턴">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput label="타이핑 속도 (최소 ms)" value={globalConfig.typing_speed_min} onChange={(v) => updateGlobal("typing_speed_min", v)} min={30} max={300} />
          <NumberInput label="타이핑 속도 (최대 ms)" value={globalConfig.typing_speed_max} onChange={(v) => updateGlobal("typing_speed_max", v)} min={60} max={500} />
          <div>
            <Label>오타 확률 ({Math.round((globalConfig.typo_probability || 0) * 100)}%)</Label>
            <input type="range" min={0} max={20} value={Math.round((globalConfig.typo_probability || 0) * 100)}
              onChange={(e) => updateGlobal("typo_probability", parseInt(e.target.value) / 100)} className="w-full" />
          </div>
          <div>
            <Label>되돌아보기 확률 ({Math.round((globalConfig.scroll_back_probability || 0) * 100)}%)</Label>
            <input type="range" min={0} max={80} value={Math.round((globalConfig.scroll_back_probability || 0) * 100)}
              onChange={(e) => updateGlobal("scroll_back_probability", parseInt(e.target.value) / 100)} className="w-full" />
          </div>
        </div>
      </Section>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500">
        <strong>현재 글로벌 설정 요약:</strong> 키워드당 {globalConfig.keyword_delay_min}~{globalConfig.keyword_delay_max}초 딜레이,{" "}
        {globalConfig.batch_size}개 처리 후 {globalConfig.batch_rest_seconds}초 휴식, 오타 {Math.round((globalConfig.typo_probability || 0) * 100)}%,{" "}
        {(globalConfig.rest_hours || []).length === 0 ? "새벽 휴식 비활성화" : `새벽 휴식 ${(globalConfig.rest_hours || []).map((h) => `${h}시`).join("·")}`}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 탭: 분석
// ══════════════════════════════════════════════════════════════════════════════
function AnalyticsTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [todayMeta, setTodayMeta] = useState<MetaRow[]>([]);
  const [todayQueue, setTodayQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [workersRes, metaRes, queueRes] = await Promise.all([
      supabase.from("workers").select("id, name, location, total_processed, error_count, block_count_today, verified_at, last_seen, block_level, block_status"),
      supabase.from("crawl_metadata")
        .select("worker_id, keyword, type, response_time_ms, result_count, blocked, captcha, empty_result, error_type, created_at")
        .gte("created_at", todayStart())
        .limit(5000),
      supabase.from("crawl_requests")
        .select("id, type, status, created_at, started_at, completed_at")
        .gte("created_at", todayStart())
        .limit(2000),
    ]);
    const now = Date.now();
    const enriched = ((workersRes.data || []) as Worker[]).map(w => ({
      ...w,
      is_active: w.last_seen ? now - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS : false,
    }));
    setWorkers(enriched);
    setTodayMeta((metaRes.data || []) as MetaRow[]);
    setTodayQueue((queueRes.data || []) as QueueItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">데이터 로딩 중...</div>;

  // ── KPI ──
  const totalProcessed = workers.reduce((s, w) => s + (w.total_processed || 0), 0);
  const totalBlocksToday = workers.reduce((s, w) => s + (w.block_count_today || 0), 0);
  const errorMeta = todayMeta.filter(m => m.blocked || m.captcha);
  const errorRate = todayMeta.length > 0 ? (errorMeta.length / todayMeta.length) * 100 : 0;
  const avgRespMs = todayMeta.length > 0
    ? todayMeta.reduce((s, m) => s + (m.response_time_ms || 0), 0) / todayMeta.length
    : 0;

  // ── 시간대별 히트맵 ──
  const hourly: Record<number, Record<string, number>> = {};
  for (let h = 0; h < 24; h++) hourly[h] = { naver: 0, instagram: 0, oclick: 0 };
  todayMeta.forEach(m => {
    const h = new Date(m.created_at).getHours();
    const cat = getCategory(m.type);
    if (cat !== "기타") hourly[h][cat] = (hourly[h][cat] || 0) + 1;
  });
  const maxHourly = Math.max(1, ...Object.values(hourly).flatMap(h => Object.values(h)));

  // ── 워커별 성능 ──
  const workerPerf = workers.map(w => {
    const wMeta = todayMeta.filter(m => m.worker_id === w.id);
    const errCount = wMeta.filter(m => m.blocked || m.captcha).length;
    const errRate = wMeta.length > 0 ? (errCount / wMeta.length) * 100 : 0;
    const avgResp = wMeta.length > 0
      ? wMeta.reduce((s, m) => s + (m.response_time_ms || 0), 0) / wMeta.length : 0;
    const score = Math.max(0, 100 - errRate * 3 - (avgResp / 100) - (w.block_count_today || 0) * 15);
    return { ...w, todayCount: wMeta.length, errRate, avgResp, score };
  }).sort((a, b) => b.todayCount - a.todayCount);

  // ── 큐 효율 ──
  const qDone = todayQueue.filter(q => q.status === "completed");
  const qFail = todayQueue.filter(q => q.status === "failed");
  const qPend = todayQueue.filter(q => q.status === "pending" || q.status === "assigned" || q.status === "running");
  const doneWithStart = qDone.filter(q => q.started_at);
  const avgWait = doneWithStart.length > 0
    ? doneWithStart.reduce((s, q) => s + (new Date(q.started_at!).getTime() - new Date(q.created_at).getTime()), 0) / doneWithStart.length : 0;
  const doneWithEnd = qDone.filter(q => q.started_at && q.completed_at);
  const avgProc = doneWithEnd.length > 0
    ? doneWithEnd.reduce((s, q) => s + (new Date(q.completed_at!).getTime() - new Date(q.started_at!).getTime()), 0) / doneWithEnd.length : 0;

  // ── 타입 분포 ──
  const typeDist: Record<string, number> = {};
  todayMeta.forEach(m => { if (m.type) typeDist[m.type] = (typeDist[m.type] || 0) + 1; });
  const typeDistArr = Object.entries(typeDist).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const catColors: Record<string, string> = { naver: "#22c55e", instagram: "#ec4899", oclick: "#f97316" };

  return (
    <div className="space-y-6">
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="오늘 총 처리" value={totalProcessed.toLocaleString()} unit="건" />
        <KpiCard label="평균 응답 시간" value={avgRespMs > 0 ? (avgRespMs / 1000).toFixed(1) : "-"} unit={avgRespMs > 0 ? "초" : ""} />
        <KpiCard label="오늘 에러율" value={todayMeta.length > 0 ? errorRate.toFixed(1) : "-"} unit={todayMeta.length > 0 ? "%" : ""} alert={errorRate > 10} />
        <KpiCard label="오늘 차단" value={totalBlocksToday.toString()} unit="건" alert={totalBlocksToday > 0} />
      </div>

      {/* 시간대별 히트맵 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-0.5">시간대별 처리량</h3>
        <p className="text-xs text-gray-400 mb-4">오늘 0시~현재 · N(네이버) I(인스타) O(오클릭) · 색 강도 = 처리량</p>
        {todayMeta.length === 0 ? (
          <p className="text-xs text-gray-400">오늘 수집된 메타데이터가 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-0.5 min-w-max">
              {/* 레이블 컬럼 */}
              <div className="flex flex-col gap-0.5 mr-1">
                {(["naver","instagram","oclick"] as const).map(cat => (
                  <div key={cat} className="h-5 w-4 flex items-center justify-end text-xs text-gray-300">
                    {cat === "naver" ? "N" : cat === "instagram" ? "I" : "O"}
                  </div>
                ))}
                <div className="h-4" />
              </div>
              {/* 24시간 */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex flex-col gap-0.5">
                  {(["naver","instagram","oclick"] as const).map(cat => {
                    const val = hourly[h][cat] || 0;
                    const opacity = val === 0 ? 0.08 : 0.15 + (val / maxHourly) * 0.85;
                    return (
                      <div key={cat} title={`${h}시 ${cat}: ${val}건`}
                        className="w-5 h-5 rounded-sm"
                        style={{ backgroundColor: catColors[cat], opacity }} />
                    );
                  })}
                  <div className="h-4 text-xs text-gray-300 text-center" style={{ fontSize: 9 }}>
                    {h % 4 === 0 ? h : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 워커 성능 비교 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">워커 성능 비교 <span className="text-xs font-normal text-gray-400">(오늘 기준)</span></h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">워커</th>
                <th className="text-right px-4 py-2 font-medium">오늘 처리</th>
                <th className="text-right px-4 py-2 font-medium">에러율</th>
                <th className="text-right px-4 py-2 font-medium">평균 응답</th>
                <th className="text-right px-4 py-2 font-medium">차단</th>
                <th className="text-right px-4 py-2 font-medium">효율 점수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workerPerf.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">워커 없음</td></tr>
              ) : workerPerf.map(w => {
                const rb = riskBadge(100 - w.score);
                return (
                  <tr key={w.id} className={w.score < 50 ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-sm">{w.name || w.id}</div>
                      {w.location && <div className="text-xs text-gray-400">📍 {w.location}</div>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {w.todayCount > 0 ? w.todayCount.toLocaleString() : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={w.errRate > 10 ? "text-red-600 font-medium" : "text-gray-600"}>
                        {w.todayCount > 0 ? `${w.errRate.toFixed(1)}%` : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {w.avgResp > 0 ? `${(w.avgResp / 1000).toFixed(1)}s` : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={w.block_count_today ? "text-red-600 font-medium" : "text-gray-300"}>
                        {w.block_count_today || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${rb.color} ${rb.bg}`}>
                        {Math.round(w.score)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 큐 효율 + 처리 속도 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">큐 처리 효율 <span className="text-xs font-normal text-gray-400">(오늘)</span></h3>
          {todayQueue.length === 0 ? (
            <p className="text-xs text-gray-400">오늘 처리된 작업 없음</p>
          ) : (
            <div className="space-y-2">
              {([
                { label: "완료", count: qDone.length, color: "#22c55e" },
                { label: "실패", count: qFail.length, color: "#ef4444" },
                { label: "대기/진행", count: qPend.length, color: "#60a5fa" },
              ] as const).map(({ label, count, color }) => {
                const pct = todayQueue.length > 0 ? (count / todayQueue.length) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-600">{label}</span>
                      <span className="text-gray-500">{count}건 ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">처리 속도</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">평균 대기 시간 (배정까지)</p>
              <p className="text-2xl font-bold text-gray-800">{avgWait > 0 ? fmtMs(avgWait) : <span className="text-gray-300 text-base">데이터 없음</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">평균 처리 시간 (완료까지)</p>
              <p className="text-2xl font-bold text-gray-800">{avgProc > 0 ? fmtMs(avgProc) : <span className="text-gray-300 text-base">데이터 없음</span>}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 타입별 분포 */}
      {typeDistArr.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">타입별 처리 분포 <span className="text-xs font-normal text-gray-400">(오늘)</span></h3>
          <div className="space-y-1.5">
            {typeDistArr.map(([type, count]) => {
              const pct = todayMeta.length > 0 ? (count / todayMeta.length) * 100 : 0;
              const cat = getCategory(type);
              const barColor = cat === "naver" ? "#22c55e" : cat === "instagram" ? "#ec4899" : "#f97316";
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-32 truncate shrink-0">
                    {CRAWL_TYPE_LABELS[type] || type}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="text-xs text-gray-400 w-20 text-right shrink-0">{count}건 ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 탭: 차단 분석
// ══════════════════════════════════════════════════════════════════════════════
function BlocksTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [blocks, setBlocks] = useState<BlockEvent[]>([]);
  const [aiLogs, setAILogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAI, setExpandedAI] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [workersRes, blocksRes, aiRes] = await Promise.all([
      supabase.from("workers").select("id, name, location, manager, block_status, block_level, block_platform, blocked_until, block_count_today, total_processed, error_count, verified_at, last_seen"),
      supabase.from("crawl_blocks")
        .select("*")
        .gte("detected_at", daysAgoISO(30))
        .order("detected_at", { ascending: false }),
      supabase.from("ai_analysis_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const now = Date.now();
    const enriched = ((workersRes.data || []) as Worker[]).map(w => ({
      ...w,
      is_active: w.last_seen ? now - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS : false,
    }));
    setWorkers(enriched);
    setBlocks((blocksRes.data || []) as BlockEvent[]);
    setAILogs((aiRes.data || []) as AILog[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">데이터 로딩 중...</div>;

  const currentlyBlocked = workers.filter(w => w.block_status);

  // 시간대별 차단 빈도
  const blocksByHour = Array<number>(24).fill(0);
  blocks.forEach(b => { blocksByHour[new Date(b.detected_at).getHours()]++; });
  const maxBlockHour = Math.max(1, ...blocksByHour);

  // 플랫폼별
  const blockByPlatform: Record<string, number> = {};
  blocks.forEach(b => { blockByPlatform[b.platform] = (blockByPlatform[b.platform] || 0) + 1; });

  // 워커별 반복 차단 수
  const blockCounts: Record<string, number> = {};
  blocks.forEach(b => { blockCounts[b.worker_id] = (blockCounts[b.worker_id] || 0) + 1; });

  // 리스크 스코어
  const riskWorkers = workers.map(w => ({ ...w, riskScore: calcRisk(w, blocks) }))
    .sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-6">
      {/* 현재 차단 현황 */}
      <div>
        <h3 className="text-sm font-bold text-gray-800 mb-2">현재 차단 현황</h3>
        {currentlyBlocked.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
            현재 차단된 워커 없음 ✓
          </div>
        ) : (
          <div className="space-y-2">
            {currentlyBlocked.map(w => {
              const until = w.blocked_until ? new Date(w.blocked_until) : null;
              const remaining = until ? Math.max(0, until.getTime() - Date.now()) : null;
              const lvl = (w.block_level || 1) as 1 | 2 | 3;
              const lvlStyle: Record<1|2|3, string> = {
                1: "bg-yellow-50 border-yellow-300 text-yellow-800",
                2: "bg-orange-50 border-orange-300 text-orange-800",
                3: "bg-red-50 border-red-300 text-red-800",
              };
              return (
                <div key={w.id} className={`border rounded-lg px-4 py-3 ${lvlStyle[lvl]}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{w.name || w.id}</span>
                      <span className="ml-2 text-xs">[{w.block_platform?.toUpperCase()} L{w.block_level}] {w.block_status}</span>
                      {w.location && <span className="ml-2 text-xs opacity-60">📍 {w.location}</span>}
                    </div>
                    {remaining !== null && (
                      <span className="text-xs">
                        해제까지 {remaining > 3600000 ? `${Math.round(remaining / 3600000)}시간` : `${Math.round(remaining / 60000)}분`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 리스크 스코어 카드 */}
      <div>
        <h3 className="text-sm font-bold text-gray-800 mb-2">
          워커 리스크 스코어
          <span className="text-xs font-normal text-gray-400 ml-1">(7일 차단 × 20 + 에러율 + 차단레벨 × 15 - 검증 보너스)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {riskWorkers.map(w => {
            const rb = riskBadge(w.riskScore);
            const sevenDaysAgo = Date.now() - 7 * 86400000;
            const recentBlocks = blocks.filter(b => b.worker_id === w.id && new Date(b.detected_at).getTime() > sevenDaysAgo);
            const errorRate = w.total_processed > 0 ? (w.error_count / w.total_processed * 100) : 0;
            return (
              <div key={w.id} className={`border rounded-lg p-3 ${rb.bg} ${rb.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-gray-800">{w.name || w.id}</span>
                    {w.location && <span className="text-xs text-gray-500 ml-1.5">📍{w.location}</span>}
                  </div>
                  <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-bold border ${rb.color} ${rb.bg} ${rb.border}`}>
                    {rb.label} {Math.round(w.riskScore)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>7일 차단: <strong>{recentBlocks.length}회</strong></div>
                  <div>누적 에러율: {errorRate.toFixed(1)}%</div>
                  {w.block_level && <div>현재 차단 레벨: L{w.block_level}</div>}
                </div>
                {w.riskScore > 50 && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-600 mb-1">권고 조치</p>
                    <div className="flex flex-wrap gap-1">
                      {w.riskScore > 60 && (
                        <span className="px-2 py-0.5 text-xs bg-white rounded border border-gray-200 text-gray-600">
                          딜레이 +10초
                        </span>
                      )}
                      {w.riskScore > 70 && (
                        <span className="px-2 py-0.5 text-xs bg-white rounded border border-gray-200 text-gray-600">
                          배치 크기 축소
                        </span>
                      )}
                      {w.riskScore > 80 && (
                        <span className="px-2 py-0.5 text-xs bg-white rounded border border-gray-200 text-gray-600">
                          새벽 휴식 추가
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 패턴 차트 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 시간대별 차단 막대 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">시간대별 차단 빈도</h3>
          <p className="text-xs text-gray-400 mb-3">최근 30일</p>
          {blocks.length === 0 ? (
            <p className="text-xs text-gray-400">차단 이력 없음</p>
          ) : (
            <div className="flex items-end gap-px h-20">
              {blocksByHour.map((count, h) => (
                <div key={h} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-sm bg-red-400"
                    style={{ height: `${Math.round((count / maxBlockHour) * 64)}px`, opacity: count === 0 ? 0.1 : 0.6 + (count / maxBlockHour) * 0.4 }}
                    title={`${h}시: ${count}건`}
                  />
                  {h % 6 === 0 && <span className="text-gray-300 mt-0.5" style={{ fontSize: 9 }}>{h}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 플랫폼별 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-1">플랫폼별 차단</h3>
          <p className="text-xs text-gray-400 mb-3">최근 30일 총 {blocks.length}건</p>
          {blocks.length === 0 ? (
            <p className="text-xs text-gray-400">차단 이력 없음</p>
          ) : (
            <div className="space-y-3 pt-1">
              {Object.entries(blockByPlatform).map(([platform, count]) => {
                const pct = (count / blocks.length) * 100;
                const color = platform === "naver" ? "#22c55e" : "#ec4899";
                return (
                  <div key={platform}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{platform === "naver" ? "네이버" : "인스타그램"}</span>
                      <span className="text-gray-500">{count}건 ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 차단 타임라인 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">차단 타임라인</h3>
          <span className="text-xs text-gray-400">최근 30일 · {blocks.length}건</span>
        </div>
        {blocks.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">차단 이력 없음</div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {blocks.slice(0, 60).map(b => {
              const worker = workers.find(w => w.id === b.worker_id);
              const isRepeat = (blockCounts[b.worker_id] || 0) >= 3;
              const lvlColor = b.level === 3 ? "text-red-600" : b.level === 2 ? "text-orange-600" : "text-yellow-600";
              return (
                <div key={b.id} className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-gray-50">
                  <span className="text-gray-400 shrink-0 w-28">
                    {new Date(b.detected_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`font-bold shrink-0 ${lvlColor}`}>[{b.platform.toUpperCase()} L{b.level}]</span>
                  <span className="text-gray-700 truncate">{worker?.name || b.worker_id}</span>
                  {isRepeat && <span className="shrink-0 text-red-500">⚠️ 반복</span>}
                  {b.resolved_at && <span className="shrink-0 text-green-600">해제됨</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI 조정 이력 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">AI 자동 조정 이력</h3>
        </div>
        {aiLogs.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">조정 이력 없음</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {aiLogs.map(log => (
              <div key={log.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString("ko-KR")}
                  </span>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{log.model}</span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{log.trigger_reason}</span>
                  {log.platform && (
                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">{log.platform}</span>
                  )}
                </div>
                {log.adjustments && Object.keys(log.adjustments).length > 0 && (
                  <div className="text-xs text-gray-600 mb-1">
                    적용: {Object.entries(log.adjustments).map(([k, v]) => `${k}: ${v}`).join(", ")}
                  </div>
                )}
                {!log.adjustments || Object.keys(log.adjustments).length === 0 ? (
                  <div className="text-xs text-gray-400 mb-1">적용된 변경 없음</div>
                ) : null}
                <button
                  onClick={() => setExpandedAI(expandedAI === log.id ? null : log.id)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  {expandedAI === log.id ? "접기 ▲" : "분석 전문 ▼"}
                </button>
                {expandedAI === log.id && (
                  <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                    {log.analysis}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 탭: 로그
// ══════════════════════════════════════════════════════════════════════════════
type LogSection = "stream" | "errors" | "history";

function LogsTab() {
  const [meta, setMeta] = useState<MetaRow[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [workers, setWorkers] = useState<Pick<Worker, "id" | "name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<LogSection>("stream");
  const [qSearch, setQSearch] = useState("");
  const [qStatus, setQStatus] = useState("all");
  const [qDays, setQDays] = useState(1);

  const load = useCallback(async () => {
    const [metaRes, queueRes, workerRes] = await Promise.all([
      supabase.from("crawl_metadata")
        .select("worker_id, keyword, type, response_time_ms, result_count, blocked, captcha, empty_result, error_type, created_at")
        .gte("created_at", todayStart())
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("crawl_requests")
        .select("id, type, keyword, status, assigned_worker, error_message, created_at, started_at, completed_at")
        .gte("created_at", daysAgoISO(qDays))
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("workers").select("id, name"),
    ]);
    setMeta((metaRes.data || []) as MetaRow[]);
    setQueue((queueRes.data || []) as QueueItem[]);
    setWorkers((workerRes.data || []) as Pick<Worker, "id" | "name">[]);
    setLoading(false);
  }, [qDays]);

  useEffect(() => { load(); }, [load]);

  const workerName = (id: string | null) =>
    id ? (workers.find(w => w.id === id)?.name || id.slice(0, 12)) : "-";

  // 에러 집계
  const errorTypes: Record<string, number> = {};
  meta.forEach(m => {
    if (m.blocked) errorTypes["차단(blocked)"] = (errorTypes["차단(blocked)"] || 0) + 1;
    if (m.captcha) errorTypes["캡차(captcha)"] = (errorTypes["캡차(captcha)"] || 0) + 1;
    if (m.empty_result && !m.blocked && !m.captcha) errorTypes["빈 결과"] = (errorTypes["빈 결과"] || 0) + 1;
    if (m.error_type && !m.blocked && !m.captcha) errorTypes[m.error_type] = (errorTypes[m.error_type] || 0) + 1;
  });
  const maxErrCount = Math.max(1, ...Object.values(errorTypes));

  // 큐 필터
  const filteredQueue = queue.filter(q => {
    if (qStatus !== "all" && q.status !== qStatus) return false;
    const kw = qSearch.toLowerCase();
    if (kw && !q.keyword.toLowerCase().includes(kw) && !q.type.toLowerCase().includes(kw)) return false;
    return true;
  });

  const SECTIONS: { key: LogSection; label: string }[] = [
    { key: "stream",  label: "이벤트 스트림" },
    { key: "errors",  label: "에러 집계" },
    { key: "history", label: "큐 이력" },
  ];

  return (
    <div className="space-y-4">
      {/* 섹션 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {SECTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setSection(key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              section === key ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 이벤트 스트림 */}
      {section === "stream" && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">오늘 이벤트 스트림</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{meta.length}건</span>
              <button onClick={load} disabled={loading}
                className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40">새로고침</button>
            </div>
          </div>
          {meta.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">오늘 수집된 이벤트 없음</div>
          ) : (
            <div className="max-h-96 overflow-y-auto font-mono">
              <div className="divide-y divide-gray-100">
                {meta.map((m, i) => {
                  const isErr = m.blocked || m.captcha;
                  const isEmpty = m.empty_result && !isErr;
                  return (
                    <div key={i} className={`px-4 py-1.5 flex items-center gap-2 text-xs ${isErr ? "bg-red-50" : isEmpty ? "bg-yellow-50" : ""}`}>
                      <span className="text-gray-300 shrink-0 w-16">
                        {new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="shrink-0">{isErr ? "❌" : isEmpty ? "⚠️" : "✅"}</span>
                      <span className="text-gray-500 shrink-0 w-20 truncate">{workerName(m.worker_id)}</span>
                      <span className="text-gray-400 shrink-0 w-24 truncate">{m.type || "-"}</span>
                      <span className="text-gray-700 truncate flex-1">{m.keyword || "-"}</span>
                      <span className="text-gray-400 shrink-0 w-16 text-right">
                        {isErr ? (m.blocked ? "BLOCKED" : "CAPTCHA") : `${m.result_count}건`}
                      </span>
                      {m.response_time_ms !== null && (
                        <span className="text-gray-300 shrink-0 w-10 text-right">{(m.response_time_ms / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 에러 집계 */}
      {section === "errors" && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">오늘 에러 유형별 집계</h3>
            <button onClick={load} className="text-xs text-blue-500 hover:text-blue-700">새로고침</button>
          </div>
          {Object.keys(errorTypes).length === 0 ? (
            <div className="py-4 text-center text-sm text-green-600 bg-green-50 rounded-lg">오늘 에러 없음 ✓</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(errorTypes)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-600">{type}</span>
                      <span className="text-gray-500 font-medium">{count}건</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400"
                        style={{ width: `${(count / maxErrCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 큐 이력 */}
      {section === "history" && (
        <div className="space-y-3">
          {/* 필터 */}
          <div className="flex gap-2 flex-wrap">
            <input type="text" placeholder="키워드 검색..." value={qSearch}
              onChange={e => setQSearch(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select value={qStatus} onChange={e => setQStatus(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white">
              <option value="all">전체 상태</option>
              <option value="completed">완료</option>
              <option value="failed">실패</option>
              <option value="running">실행중</option>
              <option value="pending">대기</option>
            </select>
            <select value={qDays} onChange={e => setQDays(Number(e.target.value))}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white">
              <option value={1}>오늘</option>
              <option value={3}>3일</option>
              <option value={7}>7일</option>
              <option value={30}>30일</option>
            </select>
            <button onClick={load} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200">
              검색
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-400 flex items-center justify-between">
              <span>{filteredQueue.length}건 표시</span>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {filteredQueue.length === 0 ? (
                <div className="px-4 py-10 text-center text-gray-400 text-sm">결과 없음</div>
              ) : filteredQueue.map(q => {
                const procMs = q.completed_at && q.started_at
                  ? new Date(q.completed_at).getTime() - new Date(q.started_at).getTime()
                  : null;
                const statusStyle: Record<string, string> = {
                  completed: "bg-green-100 text-green-700",
                  failed: "bg-red-100 text-red-700",
                  running: "bg-blue-100 text-blue-700",
                  pending: "bg-gray-100 text-gray-600",
                  assigned: "bg-yellow-100 text-yellow-700",
                };
                return (
                  <div key={q.id} className="px-4 py-2 hover:bg-gray-50">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded ${statusStyle[q.status] || "bg-gray-100 text-gray-600"}`}>
                        {q.status}
                      </span>
                      <span className="text-gray-400 shrink-0">{CRAWL_TYPE_LABELS[q.type] || q.type}</span>
                      <span className="text-gray-800 font-medium truncate flex-1">{q.keyword}</span>
                      <span className="text-gray-400 shrink-0">{workerName(q.assigned_worker)}</span>
                      {procMs !== null && (
                        <span className="text-gray-400 shrink-0">{fmtMs(procMs)}</span>
                      )}
                      <span className="text-gray-300 shrink-0">
                        {new Date(q.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {q.error_message && (
                      <div className="text-xs text-red-500 mt-0.5 truncate pl-1">{q.error_message}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 공용 컴포넌트
// ══════════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, unit, alert }: { label: string; value: string; unit?: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alert ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${alert ? "text-red-600" : "text-gray-800"}`}>
        {value}
        {unit && <span className="text-sm font-normal text-gray-500 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-400 mb-3">{desc}</p>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-1">{children}</label>;
}

function NumberInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value) || min)}
        min={min} max={max}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
