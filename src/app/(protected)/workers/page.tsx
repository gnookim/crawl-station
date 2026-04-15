"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Worker, TetheringCarrier, TetheringReconnectInterval } from "@/types";
import { WORKER_ONLINE_THRESHOLD_MS, CRAWL_CATEGORIES } from "@/types";
import { WorkerStatusBadge } from "@/components/ui/status-badge";

/* ── 워커별 테스트 상태 ── */
type TestResult = Record<string, unknown> | null;
type WorkerTestState = {
  naver: { loading: boolean; result: TestResult };
  instagram: { loading: boolean; result: TestResult };
  oclick: { loading: boolean; result: TestResult };
};
type OclickTestState = { loading: boolean; result: TestResult };

/* ── 워커별 네트워크/설정 ── */
interface WorkerNetConfig {
  network_type: string;
  proxy_url: string;
  proxy_rotate: boolean;
  tethering_carrier: string;
  tethering_auto_reconnect: boolean;
  tethering_reconnect_interval: string;
  daily_quota: number;
  daily_used: number;
  allowed_types: string[];
  update_check_interval_minutes: number;
}

interface WorkerLog {
  id: string;
  worker_id: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  created_at: string;
}

const DEFAULT_NET_CONFIG: WorkerNetConfig = {
  network_type: "wifi",
  proxy_url: "",
  proxy_rotate: false,
  tethering_carrier: "skt",
  tethering_auto_reconnect: false,
  tethering_reconnect_interval: "per_batch",
  daily_quota: 500,
  daily_used: 0,
  allowed_types: [],
  update_check_interval_minutes: 60,
};

const NETWORK_LABELS: Record<string, string> = {
  wifi: "자체 IP (WiFi/LAN)",
  tethering: "모바일 테더링",
  proxy_static: "프록시 (고정 IP)",
  proxy_rotate: "프록시 (회전 IP)",
};

const CARRIER_LABELS: Record<TetheringCarrier, string> = {
  skt: "SKT",
  kt: "KT",
  lgu: "LG U+",
  other: "기타",
};

const RECONNECT_LABELS: Record<TetheringReconnectInterval, string> = {
  per_batch: "배치마다",
  "3min": "3분마다",
  "5min": "5분마다",
  "10min": "10분마다",
};

/* ── 타입 카테고리 버튼 설정 ── */
const CAT_BUTTONS = [
  { key: "all",       label: "전체",      active: "bg-gray-700 text-white border-gray-700" },
  { key: "naver",     label: "네이버",    active: "bg-green-600 text-white border-green-600" },
  { key: "instagram", label: "인스타그램", active: "bg-pink-500 text-white border-pink-500" },
  { key: "oclick",    label: "Oclick",   active: "bg-orange-500 text-white border-orange-500" },
];

function getWorkerCat(allowed_types: string[]): string {
  if (!allowed_types || allowed_types.length === 0) return "all";
  const naverTypes  = CRAWL_CATEGORIES.find(c => c.key === "naver")?.types || [];
  const instaTypes  = CRAWL_CATEGORIES.find(c => c.key === "instagram")?.types || [];
  const oclickTypes = CRAWL_CATEGORIES.find(c => c.key === "oclick")?.types || [];
  if (allowed_types.every(t => naverTypes.includes(t)))  return "naver";
  if (allowed_types.every(t => instaTypes.includes(t)))  return "instagram";
  if (allowed_types.every(t => oclickTypes.includes(t))) return "oclick";
  return "all";
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [latestVersion, setLatestVersion] = useState<string>("");
  const [showManualRegister, setShowManualRegister] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerId, setNewWorkerId] = useState("");
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, WorkerTestState>>({});
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [oclickTest, setOclickTest] = useState<OclickTestState>({ loading: false, result: null });
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /* ── 에러 로그 상태 ── */
  const [workerLogs, setWorkerLogs] = useState<WorkerLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  async function loadWorkerLogs(workerId: string) {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/workers/logs?worker_id=${workerId}&limit=30`);
      const data = await res.json();
      setWorkerLogs(data.logs || []);
      if (data.migration_needed) setMigrationNeeded(true);
    } finally {
      setLogsLoading(false);
    }
  }

  async function clearWorkerLogs(workerId: string) {
    await fetch(`/api/workers/logs?worker_id=${workerId}`, { method: "DELETE" });
    setWorkerLogs([]);
  }

  /* ── 체크박스 + 설정 패널 상태 ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [panelWorkerId, setPanelWorkerId] = useState<string | null>(null);
  const [workerConfigs, setWorkerConfigs] = useState<Record<string, WorkerNetConfig>>({});
  const [savingWorkers, setSavingWorkers] = useState<Record<string, boolean>>({});
  const [savedWorkers, setSavedWorkers] = useState<Record<string, boolean>>({});

  /* ── 일괄 편집 상태 ── */
  const [bulkNetworkType, setBulkNetworkType] = useState<string>("");
  const [bulkQuota, setBulkQuota] = useState<string>("");
  const [bulkCategory, setBulkCategory] = useState<string>("");

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    const [workersRes, releaseRes] = await Promise.all([
      supabase.from("workers").select("*").order("registered_at", { ascending: false }),
      supabase.from("worker_releases").select("version").eq("is_latest", true).limit(1),
    ]);

    const now = Date.now();
    const enriched = (workersRes.data || []).map((w) => ({
      ...w,
      is_active: w.last_seen
        ? now - new Date(w.last_seen).getTime() < WORKER_ONLINE_THRESHOLD_MS
        : false,
    })) as Worker[];

    setWorkers(enriched);
    if (releaseRes.data?.[0]) setLatestVersion(releaseRes.data[0].version);
    setLastUpdated(new Date());
    if (showSpinner) setTimeout(() => setIsRefreshing(false), 300);

    // 워커 설정 일괄 로드 (API 1번 호출)
    try {
      const configRes = await fetch("/api/config?all=1");
      const configData = configRes.ok ? await configRes.json() : { configs: [] };
      const configList: Record<string, unknown>[] = configData.configs || [];
      const configMap = Object.fromEntries(
        configList.map((c) => [
          c.id as string,
          {
            network_type: (c.network_type as string) || "wifi",
            proxy_url: (c.proxy_url as string) || "",
            proxy_rotate: Boolean(c.proxy_rotate),
            tethering_carrier: (c.tethering_carrier as string) || "skt",
            tethering_auto_reconnect: Boolean(c.tethering_auto_reconnect),
            tethering_reconnect_interval: (c.tethering_reconnect_interval as string) || "per_batch",
            daily_quota: (c.daily_quota as number) ?? 500,
            daily_used: (c.daily_used as number) ?? 0,
            allowed_types: Array.isArray(c.allowed_types) ? c.allowed_types as string[] : [],
            update_check_interval_minutes: (c.update_check_interval_minutes as number) ?? 60,
          } satisfies WorkerNetConfig,
        ])
      );
      // 설정 없는 워커는 기본값 적용
      const merged = Object.fromEntries(
        enriched.map((w) => [w.id, configMap[w.id] ?? { ...DEFAULT_NET_CONFIG }])
      );
      setWorkerConfigs(merged);
    } catch {
      setWorkerConfigs(Object.fromEntries(enriched.map((w) => [w.id, { ...DEFAULT_NET_CONFIG }])));
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => loadData(), refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval, loadData]);

  /* ── 워커 관리 ── */
  async function registerManually() {
    if (!newWorkerName.trim()) return;
    const id = newWorkerId.trim() || `worker-${Math.random().toString(36).substring(2, 10)}`;
    await supabase.from("workers").insert({ id, name: newWorkerName.trim(), status: "offline", registered_by: "manual" });
    setNewWorkerName(""); setNewWorkerId(""); setShowManualRegister(false);
    loadData(true);
  }

  async function deleteWorker(id: string) {
    if (!confirm(`워커 "${id}"를 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().eq("id", id);
    loadData(true);
  }

  async function cleanupOfflineWorkers() {
    const offlineWorkers = workers.filter((w) => !w.is_active);
    if (offlineWorkers.length === 0) { alert("삭제할 오프라인 워커가 없습니다."); return; }
    if (!confirm(`오프라인 워커 ${offlineWorkers.length}대를 모두 삭제하시겠습니까?`)) return;
    await supabase.from("workers").delete().in("id", offlineWorkers.map((w) => w.id));
    loadData(true);
  }

  async function sendCommand(command: "stop" | "restart" | "update", workerIds?: string[]) {
    const labels = { stop: "정지", restart: "재시작", update: "업데이트" };
    const target = workerIds ? `워커 ${workerIds.length}대` : "모든 활성 워커";
    if (!confirm(`${target}에 "${labels[command]}" 명령을 보내시겠습니까?`)) return;
    setCommandLoading(workerIds?.[0] || "all");
    try {
      const res = await fetch("/api/workers/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_ids: workerIds || [], command }),
      });
      const data = await res.json();
      if (!res.ok) alert(`명령 실패: ${data.error}`);
      else alert(data.message);
    } finally {
      setCommandLoading(null);
      loadData(true);
    }
  }

  /* ── 테스트 ── */
  function initWorkerTest(workerId: string): WorkerTestState {
    return { naver: { loading: false, result: null }, instagram: { loading: false, result: null }, oclick: { loading: false, result: null } };
  }

  async function runTest(workerId: string, category: "naver" | "instagram" | "oclick") {
    setTestStates((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || initWorkerTest(workerId)),
        [category]: { loading: true, result: null },
      },
    }));
    setExpandedResults((prev) => new Set(prev).add(workerId));
    try {
      const res = await fetch("/api/test/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, category }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        [workerId]: {
          ...(prev[workerId] || initWorkerTest(workerId)),
          [category]: { loading: false, result: data },
        },
      }));
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [workerId]: {
          ...(prev[workerId] || initWorkerTest(workerId)),
          [category]: { loading: false, result: { ok: false, error: String(e) } },
        },
      }));
    }
    loadData(true);
  }

  async function runTestAll(category: "naver" | "instagram" | "oclick") {
    const targets = workers.filter((w) => w.is_active);
    if (targets.length === 0) { alert("활성 워커가 없습니다."); return; }
    if (!confirm(`활성 워커 ${targets.length}대 ${category === "naver" ? "네이버" : "인스타그램"} 테스트 실행?`)) return;

    setTestStates((prev) => {
      const next = { ...prev };
      targets.forEach((w) => {
        next[w.id] = { ...(next[w.id] || initWorkerTest(w.id)), [category]: { loading: true, result: null } };
      });
      return next;
    });
    setExpandedResults((prev) => { const s = new Set(prev); targets.forEach((w) => s.add(w.id)); return s; });

    await Promise.all(targets.map((w) => runTest(w.id, category)));
  }

  async function runTestAllFull() {
    const targets = workers.filter((w) => w.is_active);
    if (targets.length === 0) { alert("활성 워커가 없습니다."); return; }
    if (!confirm(`활성 워커 ${targets.length}대 전체 테스트(N+I) + Oclick 테스트 실행?`)) return;

    setTestStates((prev) => {
      const next = { ...prev };
      targets.forEach((w) => {
        next[w.id] = { naver: { loading: true, result: null }, instagram: { loading: true, result: null }, oclick: { loading: true, result: null } };
      });
      return next;
    });
    setExpandedResults((prev) => { const s = new Set(prev); targets.forEach((w) => s.add(w.id)); return s; });

    await Promise.all([
      ...targets.map((w) => runTest(w.id, "naver")),
      ...targets.map((w) => runTest(w.id, "instagram")),
      ...targets.map((w) => runTest(w.id, "oclick")),
    ]);
  }

  async function runOclickTest() {
    setOclickTest({ loading: true, result: null });
    try {
      const res = await fetch("/api/test/oclick", { method: "POST" });
      const data = await res.json();
      setOclickTest({ loading: false, result: data });
    } catch (e) {
      setOclickTest({ loading: false, result: { ok: false, error: String(e) } });
    }
  }

  /* ── 워커 설정 저장 ── */
  function updateWorkerNet(workerId: string, key: keyof WorkerNetConfig, value: unknown) {
    setWorkerConfigs((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || DEFAULT_NET_CONFIG), [key]: value },
    }));
  }

  async function saveWorkerConfig(workerId: string) {
    const cfg = workerConfigs[workerId];
    if (!cfg) return;
    setSavingWorkers((p) => ({ ...p, [workerId]: true }));
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: workerId, ...cfg }),
    });
    setSavingWorkers((p) => ({ ...p, [workerId]: false }));
    setSavedWorkers((p) => ({ ...p, [workerId]: true }));
    setTimeout(() => setSavedWorkers((p) => ({ ...p, [workerId]: false })), 2000);
  }

  /* ── 일괄 적용 ── */
  async function applyBulk() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    await Promise.all(ids.map(async (wid) => {
      const base = workerConfigs[wid] || DEFAULT_NET_CONFIG;
      const updated: WorkerNetConfig = { ...base };
      if (bulkNetworkType) updated.network_type = bulkNetworkType;
      if (bulkQuota) updated.daily_quota = parseInt(bulkQuota) || base.daily_quota;
      if (bulkCategory) {
        updated.allowed_types = bulkCategory === "all"
          ? []
          : CRAWL_CATEGORIES.find(c => c.key === bulkCategory)?.types || [];
      }
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wid, ...updated }),
      });
      setWorkerConfigs((prev) => ({ ...prev, [wid]: updated }));
    }));

    setBulkNetworkType(""); setBulkQuota(""); setBulkCategory("");
    setSelectedIds(new Set());
    alert(`${ids.length}개 워커에 일괄 적용 완료`);
  }

  /* ── 체크박스 ── */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === workers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(workers.map(w => w.id)));
    }
  }

  /* ── 설정 토글 ── */
  function toggleSettings(id: string) {
    setPanelWorkerId((prev) => {
      const next = prev === id ? null : id;
      if (next) { setWorkerLogs([]); loadWorkerLogs(next); }
      return next;
    });
  }

  const outdatedCount = workers.filter((w) => latestVersion && w.version !== latestVersion).length;
  const activeWorkers = workers.filter((w) => w.is_active);
  const offlineWorkers = workers.filter((w) => !w.is_active);

  // 테이블 총 컬럼 수 (체크박스 포함)
  const TABLE_COLS = 10;

  return (
    <div className="p-4 sm:p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">워커 관리</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{activeWorkers.length}대 온라인
            </span>
            {offlineWorkers.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />{offlineWorkers.length}대 오프라인
              </span>
            )}
            {outdatedCount > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">업데이트 {outdatedCount}대</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {offlineWorkers.length > 0 && (
            <button onClick={cleanupOfflineWorkers} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              오프라인 정리 ({offlineWorkers.length})
            </button>
          )}
          <button onClick={() => setShowManualRegister(!showManualRegister)} className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + 수동 등록
          </button>
        </div>
      </div>

      {/* 새로고침 바 */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button onClick={() => loadData(true)} disabled={isRefreshing} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40">
          <svg className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {lastUpdated ? lastUpdated.toLocaleTimeString("ko-KR") : "새로고침"}
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-300 mr-1">자동</span>
          {[5, 10, 30, 0].map((sec) => (
            <button key={sec} onClick={() => setRefreshInterval(sec)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors ${refreshInterval === sec ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-600"}`}>
              {sec === 0 ? "끄기" : `${sec}s`}
            </button>
          ))}
        </div>
      </div>

      {/* 수동 등록 폼 */}
      {showManualRegister && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">워커 수동 등록</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">워커 이름 *</label>
              <input type="text" value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)} placeholder="마케팅팀 PC"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">워커 ID (미입력 시 자동)</label>
              <input type="text" value={newWorkerId} onChange={(e) => setNewWorkerId(e.target.value)} placeholder="worker-custom-01"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={registerManually} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">등록</button>
            <button onClick={() => setShowManualRegister(false)} className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      {/* Oclick 테스트 결과 */}
      {(oclickTest.loading || oclickTest.result) && (
        <div className={`mb-4 border rounded-lg p-3 text-sm ${
          oclickTest.loading ? "bg-orange-50 border-orange-200" :
          oclickTest.result?.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-orange-700 text-xs">Oclick 재고 테스트</span>
            {!oclickTest.loading && oclickTest.result && (
              <span className={`text-xs font-bold ${oclickTest.result.ok ? "text-green-700" : "text-red-700"}`}>
                {oclickTest.result.ok ? "✓ 통과" : "✕ 실패"}
              </span>
            )}
            {!oclickTest.loading && oclickTest.result && (
              <span className="text-xs text-gray-400">{String(oclickTest.result.elapsed_ms || 0)}ms</span>
            )}
            {!oclickTest.loading && (
              <button onClick={() => setOclickTest({ loading: false, result: null })} className="ml-auto text-xs text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          {oclickTest.loading ? (
            <p className="text-xs text-orange-600 animate-pulse">crawler-app에 작업 요청 중... (최대 3분)</p>
          ) : oclickTest.result?.ok ? (
            <>
              <p className="text-xs text-green-700 mb-1">
                상품 수집 완료 — {String(oclickTest.result.item_count)}개
              </p>
              {Array.isArray(oclickTest.result.sample) && oclickTest.result.sample.length > 0 && (
                <div className="space-y-0.5">
                  {(oclickTest.result.sample as Record<string, unknown>[]).map((item, i) => (
                    <div key={i} className="text-xs text-gray-600">
                      [{String(item.sku)}] {String(item.name)} · {String(item.stock_status)} · 재고 {String(item.stock_qty)} · {item.price ? Number(item.price).toLocaleString() + "원" : "-"}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-red-600">{String(oclickTest.result?.error || "알 수 없는 오류")}</p>
          )}
        </div>
      )}

      {/* 워커 목록 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {workers.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">등록된 워커가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={workers.length > 0 && selectedIds.size === workers.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < workers.length; }}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium w-[180px]">워커</th>
                <th className="text-left px-4 py-2 font-medium w-[108px]">OS</th>
                <th className="text-left px-4 py-2 font-medium w-[80px]">버전</th>
                <th className="text-left px-4 py-2 font-medium w-[140px]">상태</th>
                <th className="text-left px-4 py-2 font-medium w-[80px]">마지막</th>
                <th className="text-left px-4 py-2 font-medium">현재 작업</th>
                <th className="text-right px-4 py-2 font-medium w-[84px]">처리/에러</th>
                <th className="text-center px-4 py-2 font-medium w-[80px]">테스트</th>
                <th className="text-right px-4 py-2 font-medium w-[190px]">제어</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const displayStatus = w.is_active ? w.status : "offline";
                const isActive = w.is_active;
                const ts = testStates[w.id];
                const hasResults = ts && (ts.naver.result || ts.instagram.result || ts.oclick?.result);
                const isExpanded = expandedResults.has(w.id);
                const isSettingsExpanded = panelWorkerId === w.id;
                const isSelected = selectedIds.has(w.id);

                return (
                  <>
                    <tr key={w.id} className={`border-t border-gray-100 hover:bg-gray-50 ${isSelected ? "bg-blue-50" : ""}`}>
                      {/* 체크박스 */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(w.id)}
                          className="rounded"
                        />
                      </td>

                      {/* 워커 이름 */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 flex-nowrap mb-0.5">
                          <span className="font-medium text-sm min-w-0 truncate">{w.name || w.id}</span>
                          {w.verified_at ? (
                            <span title={`테스트 통과: ${new Date(w.verified_at).toLocaleString("ko")}`}
                              className="shrink-0 px-1 py-0.5 bg-green-100 text-green-700 rounded text-xs cursor-help">검증됨</span>
                          ) : (
                            <span className="shrink-0 px-1 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">미검증</span>
                          )}
                        </div>
                        {w.location && <div className="text-xs text-gray-400 truncate">📍 {w.location}</div>}
                        {w.manager && <div className="text-xs text-gray-400 truncate">👤 {w.manager}</div>}
                        {w.current_ip && <div className="text-xs text-gray-400 font-mono truncate">🌐 {w.current_ip}</div>}
                        <div className="text-xs text-gray-300 font-mono truncate">{w.id}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs overflow-hidden"><span className="truncate block">{w.os || "-"}</span></td>
                      <td className="px-4 py-2"><VersionBadge version={w.version} latest={latestVersion} /></td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 flex-nowrap">
                          <WorkerStatusBadge status={displayStatus} />
                          <WorkerTypeBadge allowedTypes={w.allowed_types} />
                          <BlockBadge worker={w} />
                          {w.command && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs whitespace-nowrap">{w.command}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap"><LastSeenLabel lastSeen={w.last_seen} /></td>
                      <td className="px-4 py-2 text-xs text-gray-500 overflow-hidden">
                        {w.current_keyword ? (
                          <span className="block truncate" title={`${w.current_keyword} (${w.current_type})`}>
                            {w.current_keyword}
                            <span className="text-gray-400 ml-1">({w.current_type})</span>
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className="text-green-600">{w.total_processed}</span>
                        {" / "}
                        <span className="text-red-500">{w.error_count}</span>
                      </td>

                      {/* 테스트 버튼 */}
                      <td className="px-4 py-2 text-center">
                        {isActive ? (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              onClick={() => runTest(w.id, "naver")}
                              disabled={ts?.naver.loading}
                              title="네이버 blog_serp 테스트"
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50 font-medium"
                            >
                              {ts?.naver.loading ? "..." : "N"}
                            </button>
                            <button
                              onClick={() => runTest(w.id, "instagram")}
                              disabled={ts?.instagram.loading}
                              title="인스타그램 프로필 테스트"
                              className="px-2 py-1 text-xs bg-pink-50 text-pink-700 rounded hover:bg-pink-100 disabled:opacity-50 font-medium"
                            >
                              {ts?.instagram.loading ? "..." : "I"}
                            </button>
                            <button
                              onClick={() => runTest(w.id, "oclick")}
                              disabled={ts?.oclick?.loading}
                              title="Oclick 재고 동기화 테스트"
                              className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 disabled:opacity-50 font-medium"
                            >
                              {ts?.oclick?.loading ? "..." : "O"}
                            </button>
                            <button
                              onClick={() => { runTest(w.id, "naver"); runTest(w.id, "instagram"); runTest(w.id, "oclick"); }}
                              disabled={ts?.naver.loading || ts?.instagram.loading || ts?.oclick?.loading}
                              title="N+I+O 전체 테스트"
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 font-medium"
                            >
                              {(ts?.naver.loading || ts?.instagram.loading || ts?.oclick?.loading) ? "..." : "전체"}
                            </button>
                            {hasResults && (
                              <button
                                onClick={() => setExpandedResults((prev) => {
                                  const s = new Set(prev);
                                  s.has(w.id) ? s.delete(w.id) : s.add(w.id);
                                  return s;
                                })}
                                className="px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600"
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-xs">-</span>}
                      </td>

                      {/* 제어 버튼 + 수정 버튼 */}
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1 flex-nowrap">
                          <button
                            onClick={() => toggleSettings(w.id)}
                            className={`whitespace-nowrap px-2 py-1 text-xs rounded border transition-colors ${
                              isSettingsExpanded
                                ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                            }`}
                            title="수정 / 설정"
                          >
                            수정
                          </button>
                          {isActive ? (
                            <>
                              {latestVersion && (
                                <button onClick={() => sendCommand("update", [w.id])} disabled={commandLoading !== null}
                                  title={w.version === latestVersion ? "최신 버전 — 강제 재설치" : `v${w.version} → v${latestVersion}`}
                                  className={`px-2 py-1 text-xs rounded disabled:opacity-50 ${w.version !== latestVersion ? "bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}>
                                  업데이트
                                </button>
                              )}
                              <button onClick={() => sendCommand("restart", [w.id])} disabled={commandLoading !== null}
                                title="재시작"
                                className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 disabled:opacity-50">
                                재시작
                              </button>
                              <button onClick={() => sendCommand("stop", [w.id])} disabled={commandLoading !== null}
                                title="정지"
                                className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50">
                                정지
                              </button>
                            </>
                          ) : (
                            <button onClick={() => deleteWorker(w.id)} className="px-2 py-1 text-xs text-red-500 hover:text-red-700 rounded hover:bg-red-50">삭제</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* 테스트 결과 확장 행 */}
                    {isExpanded && hasResults && (
                      <tr key={`${w.id}-results`} className="bg-gray-50 border-t border-gray-100">
                        <td colSpan={TABLE_COLS} className="px-4 py-3">
                          <div className="flex gap-4 flex-wrap">
                            <TestResultPanel
                              category="naver"
                              label="네이버"
                              colorClass="green"
                              state={ts?.naver}
                            />
                            <TestResultPanel
                              category="instagram"
                              label="인스타그램"
                              colorClass="pink"
                              state={ts?.instagram}
                            />
                            {ts?.oclick?.result && (
                              <TestResultPanel
                                category="oclick"
                                label="Oclick"
                                colorClass="orange"
                                state={ts?.oclick}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                  </>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {/* 하단 액션 바 */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm">
        {selectedIds.size === 0 ? (
          /* 전체 액션 */
          <>
            <span className="text-xs text-gray-400 whitespace-nowrap mr-1">전체</span>
            <div className="w-px h-4 bg-gray-200" />
            <button onClick={() => runTestAll("naver")} className="px-2.5 py-1 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium whitespace-nowrap">N 테스트</button>
            <button onClick={() => runTestAll("instagram")} className="px-2.5 py-1 text-xs bg-pink-50 text-pink-700 rounded-lg hover:bg-pink-100 font-medium whitespace-nowrap">I 테스트</button>
            <button onClick={runOclickTest} disabled={oclickTest.loading} className="px-2.5 py-1 text-xs bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 font-medium whitespace-nowrap disabled:opacity-50">{oclickTest.loading ? "..." : "O 테스트"}</button>
            <button onClick={runTestAllFull} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap">전체 테스트</button>
            <div className="w-px h-4 bg-gray-200" />
            {latestVersion && (
              <button onClick={() => sendCommand("update")} disabled={commandLoading !== null} className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 whitespace-nowrap disabled:opacity-50">업데이트</button>
            )}
            <button onClick={() => sendCommand("restart")} disabled={commandLoading !== null} className="px-2.5 py-1 text-xs bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 whitespace-nowrap disabled:opacity-50">재시작</button>
            <button onClick={() => sendCommand("stop")} disabled={commandLoading !== null} className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 whitespace-nowrap disabled:opacity-50">정지</button>
          </>
        ) : (
          /* 선택 항목 일괄 편집 */
          <>
            <span className="font-semibold text-gray-700 whitespace-nowrap">선택 {selectedIds.size}개</span>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">네트워크:</span>
              <select value={bulkNetworkType} onChange={(e) => setBulkNetworkType(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">변경 안 함</option>
                {Object.entries(NETWORK_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">한도:</span>
              <input type="number" value={bulkQuota} onChange={(e) => setBulkQuota(e.target.value)}
                placeholder="변경 안 함" min={10} max={5000}
                className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-1">
              {[{ key: "", label: "타입 유지" }, ...CAT_BUTTONS].map(({ key, label }) => (
                <button key={key} onClick={() => setBulkCategory(key)}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    bulkCategory === key ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={applyBulk} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap">일괄 적용</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 whitespace-nowrap">해제</button>
          </>
        )}
      </div>

      {/* 우측 슬라이드 설정 패널 */}
      {panelWorkerId && (() => {
        const pw = workers.find(w => w.id === panelWorkerId);
        if (!pw) return null;
        const cfg = workerConfigs[panelWorkerId] || DEFAULT_NET_CONFIG;
        const isSaving = savingWorkers[panelWorkerId];
        const isSaved = savedWorkers[panelWorkerId];
        return (
          <>
            {/* 백드롭 */}
            <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setPanelWorkerId(null)} />
            {/* 패널 */}
            <div className="fixed top-0 right-0 h-full w-80 z-50 bg-white border-l border-gray-200 shadow-2xl flex flex-col">
              {/* 패널 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <div className="font-semibold text-gray-800 text-sm">{pw.name || pw.id}</div>
                  <div className="text-xs text-gray-400 font-mono">{pw.id}</div>
                </div>
                <button onClick={() => setPanelWorkerId(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* 설정 내용 */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                {/* 기본 정보 */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">기본 정보</div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
                    <input type="text" defaultValue={pw.name || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (pw.name || "")) {
                          supabase.from("workers").update({ name: e.target.value.trim() || null }).eq("id", pw.id).then(() => loadData());
                        }
                      }}
                      placeholder="워커 이름"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">설치 장소</label>
                    <input type="text" defaultValue={pw.location || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (pw.location || "")) {
                          supabase.from("workers").update({ location: e.target.value.trim() || null }).eq("id", pw.id).then(() => loadData());
                        }
                      }}
                      placeholder="예: 사무실 1층"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
                    <input type="text" defaultValue={pw.manager || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (pw.manager || "")) {
                          supabase.from("workers").update({ manager: e.target.value.trim() || null }).eq("id", pw.id).then(() => loadData());
                        }
                      }}
                      placeholder="담당자 이름"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
                    <input type="text" defaultValue={pw.note || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (pw.note || "")) {
                          supabase.from("workers").update({ note: e.target.value.trim() || null }).eq("id", pw.id).then(() => loadData());
                        }
                      }}
                      placeholder="용도 등 자유 메모"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  </div>
                </div>

                <div className="border-t border-gray-100" />
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">네트워크 / 크롤링</div>

                {/* 네트워크 타입 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">네트워크 타입</label>
                  <select value={cfg.network_type} onChange={(e) => updateWorkerNet(panelWorkerId, "network_type", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {Object.entries(NETWORK_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  {cfg.network_type === "tethering" && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <select value={cfg.tethering_carrier} onChange={(e) => updateWorkerNet(panelWorkerId, "tethering_carrier", e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white">
                        {(Object.entries(CARRIER_LABELS) as [TetheringCarrier, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <button onClick={() => updateWorkerNet(panelWorkerId, "tethering_auto_reconnect", !cfg.tethering_auto_reconnect)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                          cfg.tethering_auto_reconnect ? "border-green-500 bg-green-50 text-green-700" : "border-gray-300 text-gray-400 bg-white"
                        }`}>
                        자동 IP 변경 {cfg.tethering_auto_reconnect ? "ON" : "OFF"}
                      </button>
                      {cfg.tethering_auto_reconnect && (
                        <select value={cfg.tethering_reconnect_interval} onChange={(e) => updateWorkerNet(panelWorkerId, "tethering_reconnect_interval", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white">
                          {(Object.entries(RECONNECT_LABELS) as [TetheringReconnectInterval, string][]).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {(cfg.network_type === "proxy_static" || cfg.network_type === "proxy_rotate") && (
                    <input type="text" value={cfg.proxy_url} onChange={(e) => updateWorkerNet(panelWorkerId, "proxy_url", e.target.value)}
                      placeholder="http://user:pass@host:port"
                      className="mt-2 w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  )}
                </div>

                {/* 일일 한도 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">일일 한도</label>
                  <input type="number" value={cfg.daily_quota} onChange={(e) => updateWorkerNet(panelWorkerId, "daily_quota", parseInt(e.target.value) || 100)}
                    min={10} max={5000}
                    className="w-28 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                  <div className="text-xs text-gray-400 mt-1">
                    오늘 사용: <span className={cfg.daily_used >= cfg.daily_quota ? "text-red-600 font-bold" : "text-gray-600"}>{cfg.daily_used}</span> / {cfg.daily_quota}
                  </div>
                </div>

                {/* 업데이트 간격 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">자동 업데이트 간격</label>
                  <select value={cfg.update_check_interval_minutes} onChange={(e) => updateWorkerNet(panelWorkerId, "update_check_interval_minutes", parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value={10}>10분</option>
                    <option value={30}>30분</option>
                    <option value={60}>1시간</option>
                    <option value={180}>3시간</option>
                    <option value={360}>6시간</option>
                  </select>
                  <div className="text-xs text-gray-400 mt-1">새 버전 확인 주기 (기본: 1시간)</div>
                </div>

                {/* 타입 분류 */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">타입 분류</label>
                  <div className="flex gap-1 flex-wrap">
                    {CAT_BUTTONS.map(({ key, label, active }) => {
                      const currentCat = getWorkerCat(cfg.allowed_types);
                      return (
                        <button key={key}
                          onClick={() => {
                            const types = key === "all" ? [] : CRAWL_CATEGORIES.find(c => c.key === key)?.types || [];
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            updateWorkerNet(panelWorkerId, "allowed_types" as any, types);
                          }}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                            currentCat === key ? active : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {cfg.allowed_types && cfg.allowed_types.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 truncate">{cfg.allowed_types.join(", ")}</div>
                  )}
                </div>

              </div>

              {/* 에러 로그 */}
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">에러 로그</span>
                  <div className="flex gap-2">
                    <button onClick={() => loadWorkerLogs(panelWorkerId)} className="text-xs text-gray-400 hover:text-gray-600">새로고침</button>
                    {workerLogs.length > 0 && (
                      <button onClick={() => clearWorkerLogs(panelWorkerId)} className="text-xs text-red-400 hover:text-red-600">전체 삭제</button>
                    )}
                  </div>
                </div>
                {migrationNeeded ? (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                    worker_logs 테이블 미생성 — SQL 실행 필요
                  </div>
                ) : logsLoading ? (
                  <div className="text-xs text-gray-400">로딩 중...</div>
                ) : workerLogs.length === 0 ? (
                  <div className="text-xs text-gray-300">기록된 에러가 없습니다</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {workerLogs.map(log => (
                      <div key={log.id} className={`text-xs rounded p-2 border ${
                        log.level === "error" ? "bg-red-50 border-red-100 text-red-700"
                        : log.level === "info" ? "bg-blue-50 border-blue-100 text-blue-700"
                        : "bg-yellow-50 border-yellow-100 text-yellow-700"
                      }`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-mono break-all leading-tight">{log.message}</span>
                          <span className="text-gray-400 whitespace-nowrap shrink-0 ml-1">
                            {new Date(log.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 패널 푸터 — 저장 버튼 */}
              <div className="px-4 py-3 border-t border-gray-100">
                <button onClick={() => saveWorkerConfig(panelWorkerId)} disabled={isSaving}
                  className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${
                    isSaved ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  } disabled:opacity-50`}>
                  {isSaved ? "저장됨" : isSaving ? "저장 중..." : "설정 저장"}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

/* ── 테스트 결과 패널 ── */
function TestResultPanel({
  label, colorClass, state,
}: {
  category: string;
  label: string;
  colorClass: "green" | "pink" | "orange";
  state?: { loading: boolean; result: TestResult };
}) {
  const colors = {
    green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  badge: "bg-green-100 text-green-700"  },
    pink:   { bg: "bg-pink-50",   border: "border-pink-200",   text: "text-pink-700",   badge: "bg-pink-100 text-pink-700"   },
    orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  };
  const c = colors[colorClass];

  if (!state) return (
    <div className={`flex-1 border ${c.border} rounded-lg p-3 opacity-40`}>
      <div className={`text-xs font-medium ${c.text} mb-1`}>{label}</div>
      <div className="text-xs text-gray-400">테스트 안 함</div>
    </div>
  );

  if (state.loading) return (
    <div className={`flex-1 border ${c.border} rounded-lg p-3`}>
      <div className={`text-xs font-medium ${c.text} mb-1`}>{label}</div>
      <div className="text-xs text-gray-400 animate-pulse">테스트 중...</div>
    </div>
  );

  if (!state.result) return null;

  const r = state.result;
  const ok = !!r.ok;

  return (
    <div className={`flex-1 border rounded-lg p-3 ${ok ? c.bg + " " + c.border : "bg-red-50 border-red-200"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${ok ? c.text : "text-red-700"}`}>
          {ok ? "✓ 통과" : "✕ 실패"} — {label}
        </span>
        <span className="text-xs text-gray-400">{String(r.elapsed_ms || 0)}ms</span>
      </div>
      {r.error ? (
        <p className="text-xs text-red-600">{String(r.error)}</p>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-1.5">
            키워드: &quot;{String(r.keyword || "")}&quot; | 결과: {String(r.result_count || 0)}개
          </div>
          {Array.isArray(r.results) && r.results.length > 0 && (
            <div className="space-y-0.5">
              {(r.results as Record<string, unknown>[]).slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {item.rank !== undefined && (
                    <span className={`font-bold w-4 shrink-0 ${c.text}`}>{String(item.rank)}</span>
                  )}
                  {item.username != null && (
                    <span className="text-gray-600">@{String(item.username)}</span>
                  )}
                  {item.title != null && (
                    <span className="text-gray-600 truncate max-w-xs">{String(item.title)}</span>
                  )}
                  {item.follower_count !== undefined && (
                    <span className="text-gray-400">팔로워 {Number(item.follower_count).toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── 차단 배지 ── */
function BlockBadge({ worker: w }: { worker: Worker }) {
  if (!w.block_status && w.status !== "blocked") return null;

  const platform = w.block_platform;
  const level = w.block_level;
  const until = w.blocked_until;

  const platformLabel = platform === "naver" ? "N" : platform === "instagram" ? "I" : "?";
  const levelColor =
    level === 3 ? "bg-red-500 text-white" :
    level === 2 ? "bg-orange-400 text-white" :
    "bg-yellow-300 text-yellow-900";

  const untilStr = until ? ` ~${new Date(until).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <span
      title={`${platform || ""} 차단 Level ${level || "?"}${untilStr}`}
      className={`px-1.5 py-0.5 text-xs rounded font-medium cursor-help ${levelColor}`}
    >
      {platformLabel} 차단{level ? ` L${level}` : ""}
    </span>
  );
}

/* ── 타입 배지 ── */
function WorkerTypeBadge({ allowedTypes }: { allowedTypes: string[] | null | undefined }) {
  if (!allowedTypes || allowedTypes.length === 0) return null;
  const naverTypes  = ["kin_analysis", "blog_crawl", "blog_serp", "rank_check", "deep_analysis", "area_analysis", "daily_rank"];
  const instaTypes  = ["instagram_profile"];
  const oclickTypes = ["oclick_sync"];
  const isNaver  = allowedTypes.every((t) => naverTypes.includes(t));
  const isInsta  = allowedTypes.every((t) => instaTypes.includes(t));
  const isOclick = allowedTypes.every((t) => oclickTypes.includes(t));
  if (isNaver)  return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">네이버</span>;
  if (isInsta)  return <span className="px-1.5 py-0.5 text-xs bg-pink-100 text-pink-700 rounded">인스타</span>;
  if (isOclick) return <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">Oclick</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">혼합</span>;
}

/* ── 마지막 응답 ── */
function LastSeenLabel({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return <span className="text-gray-300">-</span>;
  const seconds = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (seconds < 10) return <span className="text-green-500">방금 전</span>;
  if (seconds < 60) return <span className="text-green-600">{seconds}초 전</span>;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return <span className="text-yellow-600">{minutes}분 전</span>;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return <span className="text-orange-600">{hours}시간 전</span>;
  return <span className="text-red-500">{Math.floor(hours / 24)}일 전</span>;
}

/* ── 버전 배지 ── */
function VersionBadge({ version, latest }: { version: string; latest: string }) {
  if (!version || version === "0.0.0") return <span className="text-xs text-gray-400">-</span>;
  const isLatest = version === latest;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ${isLatest ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
      v{version}
      {!isLatest && latest && <span className="text-yellow-500" title={`최신: v${latest}`}>↑</span>}
    </span>
  );
}
