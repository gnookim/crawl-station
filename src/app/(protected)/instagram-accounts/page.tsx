"use client";

import { useEffect, useState, useCallback } from "react";

type AccountStatus = "active" | "cooling" | "blocked" | "banned";
type TestStatus = "ok" | "fail" | null;
type FilterTab = "all" | "active" | "cooling" | "blocked";

interface Worker {
  id: string;
  name?: string;
  is_active: boolean;
}

interface InstagramAccount {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  team: string | null;
  creator: string | null;
  is_active: boolean;
  status: AccountStatus;
  last_login_at: string | null;
  last_used_at: string | null;
  last_blocked_at: string | null;
  blocked_until: string | null;
  assigned_worker_id: string | null;
  login_count: number;
  block_count: number;
  note: string | null;
  last_test_at: string | null;
  last_test_status: TestStatus;
  created_at: string;
}

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: string; dot: string }> = {
  active:  { label: "활성",    color: "bg-green-100 text-green-700",  dot: "bg-green-500" },
  cooling: { label: "쿨다운",  color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400" },
  blocked: { label: "차단됨",  color: "bg-red-100 text-red-700",      dot: "bg-red-500" },
  banned:  { label: "영구차단", color: "bg-gray-200 text-gray-500",   dot: "bg-gray-400" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── 계정 테스트 결과 상태 ──────────────────────────
type LocalTest = { status: "idle" | "running" | "ok" | "fail"; error?: string };

export default function InstagramAccountsPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "", team: "", creator: "", note: "", assigned_worker_id: "" });
  const [showFormPw, setShowFormPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<InstagramAccount & { password: string }>>({});
  const [editWorkerId, setEditWorkerId] = useState<string>("");
  const [showEditPw, setShowEditPw] = useState(false);

  // 로컬 테스트 상태 (세션 내, 탭 새로고침 시 초기화)
  const [testState, setTestState] = useState<Record<string, LocalTest>>({});

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/instagram-accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    const t = setInterval(loadAccounts, 15000);
    return () => clearInterval(t);
  }, [loadAccounts]);

  useEffect(() => {
    fetch("/api/workers").then(r => r.json()).then(d => setWorkers(d.workers || [])).catch(() => setWorkers([]));
  }, []);

  // ── 필터링 ──────────────────────────────────────
  const filtered = accounts.filter((a) => {
    const matchTab =
      filter === "all" ||
      (filter === "active" && a.status === "active" && a.is_active) ||
      (filter === "cooling" && a.status === "cooling") ||
      (filter === "blocked" && (a.status === "blocked" || a.status === "banned"));
    const q = search.toLowerCase();
    const matchSearch = !q || a.username.toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.team || "").toLowerCase().includes(q) ||
      (a.creator || "").toLowerCase().includes(q) ||
      (a.note || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const totalCount = accounts.length;
  const activeCount = accounts.filter(a => a.is_active && a.status === "active").length;
  const coolingCount = accounts.filter(a => a.status === "cooling").length;
  const blockedCount = accounts.filter(a => a.status === "blocked" || a.status === "banned").length;
  const okCount = accounts.filter(a => a.last_test_status === "ok").length;

  // ── CRUD ────────────────────────────────────────
  async function addAccount() {
    if (!form.username.trim() || !form.password.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/instagram-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(`등록 실패: ${data.error}`); return; }
      setForm({ username: "", password: "", email: "", phone: "", team: "", creator: "", note: "", assigned_worker_id: "" });
      setShowAddForm(false);
      loadAccounts();
    } finally { setSubmitting(false); }
  }

  async function saveEdit(id: string) {
    const { note, email, phone, team, creator, password } = editFields;
    const updates: Record<string, string | null> = {};
    if (note !== undefined) updates.note = note || null;
    if (email !== undefined) updates.email = email || null;
    if (phone !== undefined) updates.phone = phone || null;
    if (team !== undefined) updates.team = team || null;
    if (creator !== undefined) updates.creator = creator || null;
    if (password) updates.password = password;
    updates.assigned_worker_id = editWorkerId || null;
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setExpandedId(null);
    setEditFields({});
    loadAccounts();
  }

  function startEdit(acc: InstagramAccount) {
    setEditFields({ note: acc.note || "", email: acc.email || "", phone: acc.phone || "", team: acc.team || "", creator: acc.creator || "", password: "" });
    setEditWorkerId(acc.assigned_worker_id || "");
    setShowEditPw(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    loadAccounts();
  }

  async function clearBlock(id: string) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_block: true }),
    });
    loadAccounts();
  }

  async function clearSession(id: string) {
    await fetch(`/api/instagram-accounts?id=${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_session: true }),
    });
    loadAccounts();
  }

  async function deleteAccount(id: string, username: string) {
    if (!confirm(`@${username} 계정을 삭제하시겠습니까?`)) return;
    await fetch(`/api/instagram-accounts?id=${id}`, { method: "DELETE" });
    loadAccounts();
  }

  // ── 테스트 ──────────────────────────────────────
  async function runTest(accountId: string) {
    setTestState(s => ({ ...s, [accountId]: { status: "running" } }));
    try {
      const res = await fetch("/api/test/instagram-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });
      const data = await res.json();
      setTestState(s => ({ ...s, [accountId]: { status: data.ok ? "ok" : "fail", error: data.error } }));
      loadAccounts(); // last_test_at / last_test_status 갱신
    } catch {
      setTestState(s => ({ ...s, [accountId]: { status: "fail", error: "네트워크 오류" } }));
    }
  }

  async function runTestAll() {
    const targets = accounts.filter(a => a.is_active && a.status === "active");
    for (const acc of targets) {
      await runTest(acc.id);
    }
  }

  // ── 렌더 ────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Instagram 계정 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">크롤링 워커에 할당되는 로그인 계정 풀</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runTestAll}
            className="px-3 py-1.5 text-sm border border-pink-300 text-pink-600 rounded-md hover:bg-pink-50"
          >
            전체 테스트
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 text-sm bg-pink-600 text-white rounded-md hover:bg-pink-700"
          >
            + 계정 추가
          </button>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: "전체", value: totalCount, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
          { label: "활성", value: activeCount, color: "text-green-700", bg: "bg-green-50 border-green-100" },
          { label: "쿨다운", value: coolingCount, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-100" },
          { label: "차단됨", value: blockedCount, color: "text-red-700", bg: "bg-red-50 border-red-100" },
          { label: "테스트 정상", value: okCount, color: "text-purple-700", bg: "bg-purple-50 border-purple-100" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-lg p-3 border ${bg}`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* 계정 추가 폼 */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">계정 추가</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="사용자명 *">
              <input type="text" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} placeholder="instagram_username" className={inputCls} />
            </Field>
            <Field label="비밀번호 *">
              <div className="relative">
                <input type={showFormPw ? "text" : "password"} value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} placeholder="비밀번호" className={`${inputCls} pr-12`} />
                <button type="button" onClick={() => setShowFormPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">{showFormPw ? "숨김" : "표시"}</button>
              </div>
            </Field>
            <Field label="등록 이메일">
              <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="계정 생성 이메일" className={inputCls} />
            </Field>
            <Field label="전화번호">
              <input type="text" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" className={inputCls} />
            </Field>
            <Field label="관리팀">
              <input type="text" value={form.team} onChange={(e) => setForm(f => ({ ...f, team: e.target.value }))} placeholder="예: 마케팅팀" className={inputCls} />
            </Field>
            <Field label="생성자">
              <input type="text" value={form.creator} onChange={(e) => setForm(f => ({ ...f, creator: e.target.value }))} placeholder="담당자 이름" className={inputCls} />
            </Field>
            <Field label="전용 워커">
              <select value={form.assigned_worker_id} onChange={(e) => setForm(f => ({ ...f, assigned_worker_id: e.target.value }))} className={`${inputCls} bg-white`}>
                <option value="">공용 (미지정)</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name || w.id.slice(0, 12)} {w.is_active ? "● 온라인" : "○ 오프라인"}</option>)}
              </select>
            </Field>
            <Field label="메모">
              <input type="text" value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} placeholder="계정 용도 설명" className={inputCls} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button onClick={addAccount} disabled={submitting || !form.username.trim() || !form.password.trim()} className="px-4 py-1.5 text-sm bg-pink-600 text-white rounded-md hover:bg-pink-700 disabled:opacity-50">
              {submitting ? "등록 중..." : "등록"}
            </button>
            <button onClick={() => { setShowAddForm(false); setForm({ username: "", password: "", email: "", phone: "", team: "", creator: "", note: "", assigned_worker_id: "" }); }} className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 필터 + 검색 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["all", "active", "cooling", "blocked"] as FilterTab[]).map(tab => {
            const labels: Record<FilterTab, string> = { all: "전체", active: "활성", cooling: "쿨다운", blocked: "차단됨" };
            const counts: Record<FilterTab, number> = { all: totalCount, active: activeCount, cooling: coolingCount, blocked: blockedCount };
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${filter === tab ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500 hover:text-gray-700"}`}
              >
                {labels[tab]} <span className="ml-1 text-gray-400">{counts[tab]}</span>
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="계정명, 이메일, 팀 검색..."
          className="flex-1 max-w-xs px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400"
        />
      </div>

      {/* 계정 목록 */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-400 text-sm">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-400 text-sm">
          {search || filter !== "all" ? "검색 결과가 없습니다." : "등록된 Instagram 계정이 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(acc => {
            const scfg = STATUS_CONFIG[acc.status] || STATUS_CONFIG.active;
            const isExpanded = expandedId === acc.id;
            const localTest = testState[acc.id];
            const assignedWorker = workers.find(w => w.id === acc.assigned_worker_id);

            // 테스트 표시: 로컬 > DB
            const testDisplay = localTest
              ? localTest
              : acc.last_test_status
                ? { status: acc.last_test_status as "ok" | "fail", testedAt: acc.last_test_at }
                : { status: "idle" as const };

            return (
              <div
                key={acc.id}
                className={`bg-white border rounded-lg overflow-hidden transition-all ${!acc.is_active ? "opacity-60" : ""} ${isExpanded ? "border-pink-300 shadow-sm" : "border-gray-200"}`}
              >
                {/* 메인 행 */}
                <div className="px-4 py-3 flex items-center gap-4">
                  {/* 상태 표시등 */}
                  <div className="relative shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${scfg.dot}`} />
                    {acc.is_active && acc.status === "active" && (
                      <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${scfg.dot} animate-ping opacity-60`} />
                    )}
                  </div>

                  {/* 계정 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">@{acc.username}</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${scfg.color}`}>{scfg.label}</span>
                      {acc.blocked_until && new Date(acc.blocked_until) > new Date() && (
                        <span className="text-xs text-gray-400">~{new Date(acc.blocked_until).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-3 flex-wrap">
                      {acc.team && <span>{acc.team}</span>}
                      {acc.creator && <span>by {acc.creator}</span>}
                      {acc.last_used_at && <span>마지막 사용: {timeAgo(acc.last_used_at)}</span>}
                      {assignedWorker ? (
                        <span className={assignedWorker.is_active ? "text-green-600" : "text-gray-400"}>
                          워커: {assignedWorker.name || assignedWorker.id.slice(0, 10)}
                        </span>
                      ) : <span className="text-gray-300">공용</span>}
                    </div>
                  </div>

                  {/* 테스트 뱃지 */}
                  <div className="shrink-0 text-center min-w-[80px]">
                    {testDisplay.status === "running" ? (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full animate-pulse">테스트 중...</span>
                    ) : testDisplay.status === "ok" ? (
                      <div>
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">✓ 정상</span>
                        {("testedAt" in testDisplay && testDisplay.testedAt) && (
                          <div className="text-xs text-gray-400 mt-0.5">{timeAgo(testDisplay.testedAt)}</div>
                        )}
                        {acc.last_test_at && !("testedAt" in testDisplay) && (
                          <div className="text-xs text-gray-400 mt-0.5">{timeAgo(acc.last_test_at)}</div>
                        )}
                      </div>
                    ) : testDisplay.status === "fail" ? (
                      <div>
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">✗ 실패</span>
                        {acc.last_test_at && <div className="text-xs text-gray-400 mt-0.5">{timeAgo(acc.last_test_at)}</div>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">미확인</span>
                    )}
                  </div>

                  {/* 로그인/차단 통계 */}
                  <div className="shrink-0 text-right min-w-[60px]">
                    <div className="text-xs">
                      <span className="text-green-600 font-medium">{acc.login_count}</span>
                      <span className="text-gray-300 mx-0.5">/</span>
                      <span className="text-red-500 font-medium">{acc.block_count}</span>
                    </div>
                    <div className="text-xs text-gray-400">로그인/차단</div>
                  </div>

                  {/* 액션 */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => runTest(acc.id)}
                      disabled={testDisplay.status === "running"}
                      className="px-2 py-1 text-xs border border-pink-200 text-pink-600 rounded hover:bg-pink-50 disabled:opacity-50"
                    >
                      테스트
                    </button>
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedId(null);
                          setEditFields({});
                        } else {
                          setExpandedId(acc.id);
                          startEdit(acc);
                        }
                      }}
                      className="px-2 py-1 text-xs border border-gray-200 text-gray-500 rounded hover:bg-gray-50"
                    >
                      {isExpanded ? "닫기" : "편집"}
                    </button>
                  </div>
                </div>

                {/* 확장 영역 — 편집 폼 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="등록 이메일">
                        <input type="email" value={editFields.email ?? ""} onChange={(e) => setEditFields(f => ({ ...f, email: e.target.value }))} placeholder="이메일" className={inputCls} />
                      </Field>
                      <Field label="전화번호">
                        <input type="text" value={editFields.phone ?? ""} onChange={(e) => setEditFields(f => ({ ...f, phone: e.target.value }))} placeholder="전화번호" className={inputCls} />
                      </Field>
                      <Field label="관리팀">
                        <input type="text" value={editFields.team ?? ""} onChange={(e) => setEditFields(f => ({ ...f, team: e.target.value }))} placeholder="관리팀" className={inputCls} />
                      </Field>
                      <Field label="생성자">
                        <input type="text" value={editFields.creator ?? ""} onChange={(e) => setEditFields(f => ({ ...f, creator: e.target.value }))} placeholder="생성자" className={inputCls} />
                      </Field>
                      <Field label="전용 워커">
                        <select value={editWorkerId} onChange={(e) => setEditWorkerId(e.target.value)} className={`${inputCls} bg-white`}>
                          <option value="">공용 (미지정)</option>
                          {workers.map(w => <option key={w.id} value={w.id}>{w.name || w.id.slice(0, 12)} {w.is_active ? "● 온라인" : "○ 오프라인"}</option>)}
                        </select>
                      </Field>
                      <Field label="메모">
                        <input type="text" value={editFields.note ?? ""} onChange={(e) => setEditFields(f => ({ ...f, note: e.target.value }))} placeholder="메모" className={inputCls} />
                      </Field>
                      <Field label="비밀번호 변경">
                        <div className="relative">
                          <input type={showEditPw ? "text" : "password"} value={editFields.password ?? ""} onChange={(e) => setEditFields(f => ({ ...f, password: e.target.value }))} placeholder="변경할 비밀번호 (빈칸 = 유지)" className={`${inputCls} pr-12`} />
                          <button type="button" onClick={() => setShowEditPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">{showEditPw ? "숨김" : "표시"}</button>
                        </div>
                      </Field>
                    </div>

                    {/* 계정 상세 정보 */}
                    <div className="text-xs text-gray-400 flex flex-wrap gap-4">
                      <span>계정 ID: {acc.id.slice(0, 16)}...</span>
                      {acc.last_login_at && <span>마지막 로그인: {fmtDateShort(acc.last_login_at)}</span>}
                      {acc.last_blocked_at && <span>마지막 차단: {fmtDateShort(acc.last_blocked_at)}</span>}
                      {acc.last_test_at && <span>마지막 테스트: {fmtDateShort(acc.last_test_at)} ({acc.last_test_status === "ok" ? "✓ 정상" : "✗ 실패"})</span>}
                      <span>등록일: {fmtDateShort(acc.created_at)}</span>
                    </div>

                    {/* 액션 버튼 행 */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-2">
                        <button onClick={() => toggleActive(acc.id, acc.is_active)} className={`px-3 py-1.5 text-xs rounded border ${acc.is_active ? "border-gray-300 text-gray-500 hover:bg-gray-100" : "border-green-300 text-green-600 hover:bg-green-50"}`}>
                          {acc.is_active ? "비활성화" : "활성화"}
                        </button>
                        {(acc.status === "cooling" || acc.status === "blocked") && (
                          <button onClick={() => clearBlock(acc.id)} className="px-3 py-1.5 text-xs rounded border border-blue-300 text-blue-600 hover:bg-blue-50">
                            차단 해제
                          </button>
                        )}
                        {acc.last_login_at && (
                          <button onClick={() => clearSession(acc.id)} className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100">
                            세션 초기화
                          </button>
                        )}
                        <button onClick={() => deleteAccount(acc.id, acc.username)} className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-500 hover:bg-red-50">
                          삭제
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setExpandedId(null); setEditFields({}); }} className="px-3 py-1.5 text-xs border border-gray-300 text-gray-500 rounded hover:bg-gray-100">취소</button>
                        <button onClick={() => saveEdit(acc.id)} className="px-4 py-1.5 text-xs bg-pink-600 text-white rounded hover:bg-pink-700">저장</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 안내 */}
      <div className="mt-5 p-3 bg-pink-50 border border-pink-100 rounded-lg text-xs text-pink-700 space-y-1">
        <p className="font-medium">사용 방식</p>
        <p>• 워커가 Instagram 크롤링 시 이 목록에서 계정을 자동 선택하여 로그인 세션을 사용합니다.</p>
        <p>• <strong>테스트</strong>: 해당 계정으로 실제 Instagram 로그인 가능 여부를 확인합니다. 온라인 워커가 필요합니다.</p>
        <p>• 계정이 차단되면 자동으로 &quot;쿨다운&quot;으로 변경되고 다른 계정으로 전환합니다.</p>
        <p>• 전용 워커를 지정하면 해당 워커만 그 계정을 사용하고, 미지정 시 공용으로 공유됩니다.</p>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-pink-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
