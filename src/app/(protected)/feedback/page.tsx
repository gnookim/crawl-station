"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getCurrentUser, getAuthHeaders } from "@/lib/sso";
import type { SSOUser } from "@/lib/sso";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type FType     = "bug" | "feature" | "improvement";
type FPriority = "high" | "medium" | "low";
type FStatus   = "pending" | "in_progress" | "resolved" | "done";
type Tab       = "all" | FStatus;

interface FeedbackItem {
  id: string;
  type: FType;
  priority: FPriority;
  title: string;
  description: string;
  status: FStatus;
  submitted_by: string | null;
  user_id: string | null;
  admin_reply: string | null;
  reply_image_urls: string[] | null;
  replied_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  image_urls: string[] | null;
}

interface Comment {
  id: string;
  feedback_id: string;
  user_id: string | null;
  author_name: string | null;
  is_admin: boolean;
  body: string;
  created_at: string;
}

// ─── 설정 ─────────────────────────────────────────────────────────────────────

const T_CFG: Record<FType, { icon: string; label: string }> = {
  bug:         { icon: "🐛", label: "버그"  },
  feature:     { icon: "💡", label: "기능"  },
  improvement: { icon: "🔧", label: "개선"  },
};

const P_CFG: Record<FPriority, { label: string; cls: string }> = {
  high:   { label: "HIGH",   cls: "bg-red-100 text-red-700"     },
  medium: { label: "MEDIUM", cls: "bg-amber-100 text-amber-700" },
  low:    { label: "LOW",    cls: "bg-blue-100 text-blue-600"   },
};

const S_CFG: Record<FStatus, { label: string; cls: string }> = {
  pending:     { label: "접수",     cls: "bg-gray-100 text-gray-600"   },
  in_progress: { label: "처리중",   cls: "bg-blue-100 text-blue-700"   },
  resolved:    { label: "확인요청", cls: "bg-amber-100 text-amber-700" },
  done:        { label: "완료",     cls: "bg-green-100 text-green-700" },
};

const TABS: Tab[] = ["all", "pending", "in_progress", "resolved", "done"];
const TAB_LABEL: Record<Tab, string> = {
  all: "전체", pending: "접수", in_progress: "처리중", resolved: "확인요청", done: "완료",
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

async function api(url: string, init?: RequestInit) {
  const h = await getAuthHeaders();
  return fetch(url, { ...init, headers: { ...h, ...(init?.headers ?? {}) } });
}

// ─── 이미지 업로더 ────────────────────────────────────────────────────────────

function ImgUploader({ value, onChange, max }: { value: string[]; onChange: (v: string[]) => void; max: number }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || busy) return;
    const list = Array.from(files).slice(0, max - value.length);
    setBusy(true);
    try {
      const urls = await Promise.all(list.map(async (f) => {
        const fd = new FormData(); fd.append("file", f);
        const r = await fetch("/api/feedback/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error("실패");
        return (await r.json()).url as string;
      }));
      onChange([...value, ...urls]);
    } catch { alert("이미지 업로드 실패. 파일 크기(5MB 이하)와 형식(JPG/PNG/GIF/WEBP)을 확인해주세요."); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((u, i) => (
          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-40 gap-0.5">
            {busy ? <span className="text-lg animate-spin">⟳</span> : <><span className="text-xl leading-none">+</span><span className="text-xs">사진</span></>}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
      <p className="text-xs text-gray-400">최대 {max}장 · JPG/PNG/GIF/WEBP · 5MB 이하</p>
    </div>
  );
}

// ─── 이미지 썸네일 ────────────────────────────────────────────────────────────

function Thumbs({ urls }: { urls: string[] | null }) {
  if (!urls?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
          className="block w-14 h-14 rounded-md overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  );
}

// ─── 새 요청 모달 ─────────────────────────────────────────────────────────────

function NewModal({ user, onClose, onDone }: { user: SSOUser | null; onClose: () => void; onDone: () => void }) {
  const [type,  setType]  = useState<FType>("feature");
  const [pri,   setPri]   = useState<FPriority>("medium");
  const [title, setTitle] = useState("");
  const [desc,  setDesc]  = useState("");
  const [name,  setName]  = useState(user?.name ?? "");
  const [imgs,  setImgs]  = useState<string[]>([]);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  const inp = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  async function submit() {
    if (!title.trim() || !desc.trim()) { setErr("제목과 내용은 필수입니다."); return; }
    setBusy(true); setErr("");
    const r = await api("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, priority: pri, title: title.trim(), description: desc.trim(), submitted_by: name.trim() || null, image_urls: imgs }),
    });
    if (r.ok) { onDone(); onClose(); }
    else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "제출 실패"); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">오류 신고 & 기능 개발</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* 유형 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">유형</p>
            <div className="flex gap-2">
              {(["bug","feature","improvement"] as FType[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${type===t ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {T_CFG[t].icon} {T_CFG[t].label}
                </button>
              ))}
            </div>
          </div>
          {/* 우선순위 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">우선순위</p>
            <div className="flex gap-2">
              {(["high","medium","low"] as FPriority[]).map(p => (
                <button key={p} type="button" onClick={() => setPri(p)}
                  className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${pri===p ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {P_CFG[p].label}
                </button>
              ))}
            </div>
          </div>
          {/* 제목 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">제목 <span className="text-red-400">*</span></p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="요청 제목" className={inp} />
          </div>
          {/* 내용 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">내용 <span className="text-red-400">*</span></p>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={5}
              placeholder="상세 내용을 입력하세요. 버그인 경우 재현 절차를 포함해주세요." className={inp + " resize-none"} />
          </div>
          {/* 첨부 이미지 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">첨부 이미지 (최대 3장)</p>
            <ImgUploader value={imgs} onChange={setImgs} max={3} />
          </div>
          {/* 이름 */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">제출자 이름 <span className="text-gray-400 font-normal">(선택)</span></p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={user?.name ?? "익명"} className={inp} />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">{busy ? "제출 중…" : "제출"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 관리자 답변 모달 ─────────────────────────────────────────────────────────

function ReplyModal({ item, onClose, onDone }: { item: FeedbackItem; onClose: () => void; onDone: () => void }) {
  const [reply,    setReply]    = useState(item.admin_reply ?? "");
  const [imgs,     setImgs]     = useState<string[]>(item.reply_image_urls ?? []);
  const [resolve,  setResolve]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  async function save() {
    setBusy(true); setErr("");
    const body: Record<string, unknown> = { admin_reply: reply.trim() || null, reply_image_urls: imgs };
    if (resolve) body.status = "resolved";
    const r = await api(`/api/feedback/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) { onDone(); onClose(); }
    else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "저장 실패"); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">관리자 답변</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{T_CFG[item.type]?.icon} [{T_CFG[item.type]?.label}] · {P_CFG[item.priority]?.label}</p>
            <p className="text-sm font-medium text-gray-800">{item.title}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">답변 내용</p>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={6}
              placeholder="처리 내용, 결과 설명, 반영 버전 등을 입력하세요."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">결과 캡처 이미지 (최대 5장)</p>
            <ImgUploader value={imgs} onChange={setImgs} max={5} />
          </div>
          {item.status !== "resolved" && item.status !== "done" && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={resolve} onChange={e => setResolve(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700">저장 시 <strong className="text-amber-600">확인 요청</strong> 상태로 전환</span>
            </label>
          )}
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 피드백 카드 ──────────────────────────────────────────────────────────────

function Card({
  item, user, isAdmin, onUpdate, onDelete, onReply,
}: {
  item: FeedbackItem;
  user: SSOUser | null;
  isAdmin: boolean;
  onUpdate: (id: string, p: Partial<FeedbackItem>) => void;
  onDelete: (id: string) => void;
  onReply:  (item: FeedbackItem) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [cmts,    setCmts]    = useState<Comment[]>([]);
  const [loaded,  setLoaded]  = useState(false);
  const [text,    setText]    = useState("");
  const [sending, setSending] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const tc = T_CFG[item.type]     ?? T_CFG.feature;
  const pc = P_CFG[item.priority] ?? P_CFG.medium;
  const sc = S_CFG[item.status]   ?? S_CFG.pending;
  const done = item.status === "done";
  const myItem = user?.id === item.user_id;

  // 댓글 로드
  useEffect(() => {
    if (open && !loaded) {
      api(`/api/feedback/${item.id}/comments`).then(r => r.json())
        .then(({ comments }) => { setCmts(comments ?? []); setLoaded(true); })
        .catch(() => setLoaded(true));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendComment() {
    if (!text.trim() || sending) return;
    setSending(true);
    const r = await api(`/api/feedback/${item.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text.trim(), author_name: user?.name ?? undefined }),
    });
    if (r.ok) { const { comment } = await r.json(); setCmts(p => [...p, comment]); setText(""); }
    setSending(false);
  }

  async function delComment(cid: string) {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const r = await api(`/api/feedback/${item.id}/comments/${cid}`, { method: "DELETE" });
    if (r.ok) setCmts(p => p.filter(c => c.id !== cid));
  }

  async function setStatus(status: FStatus) {
    const r = await api(`/api/feedback/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const upd: Partial<FeedbackItem> = { status };
      if (status === "done") upd.completed_at = new Date().toISOString();
      onUpdate(item.id, upd);
    }
  }

  async function del() {
    if (!confirm("이 항목을 삭제하시겠습니까? 댓글도 함께 삭제됩니다.")) return;
    const r = await api(`/api/feedback/${item.id}`, { method: "DELETE" });
    if (r.ok) onDelete(item.id);
  }

  // 📋 원본 복사
  function copyOriginal() {
    const lines = [
      `${tc.icon} [${tc.label}] ${item.title}  ${pc.label} · ${sc.label}`,
      "", "📝 내용", item.description,
    ];
    if (item.image_urls?.length) { lines.push("", "📎 첨부 이미지"); item.image_urls.forEach(u => lines.push(u)); }
    lines.push("", "---", `제출자: ${item.submitted_by ?? "익명"} | ${fmt(item.created_at)} | ID: ${item.id}`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  // 🤖 Claude 프롬프트 복사 (해당 댓글까지 누적)
  function copyPrompt(cmt: Comment) {
    const thread = cmts.slice(0, cmts.indexOf(cmt) + 1);
    const lines = [
      "아래 원본 요청과 처리 내용을 바탕으로 추가 수정 요청을 반영해줘.",
      "", `## 원본 요청 (${tc.label} · ${pc.label})`, `제목: ${item.title}`, "", item.description,
    ];
    if (item.admin_reply) {
      lines.push("", "## 처리된 내용", item.admin_reply);
      if (item.reply_image_urls?.length) { lines.push("", "처리 결과 캡처:"); item.reply_image_urls.forEach(u => lines.push(u)); }
    }
    if (thread.length) {
      lines.push("", "## 추가 수정 요청 (대화)");
      thread.forEach(c => lines.push(`[${c.is_admin ? "관리자" : c.author_name ?? "사용자"}] ${c.body}`));
    }
    lines.push("", "---", `ID: ${item.id} | 제출자: ${item.submitted_by ?? "익명"}`);
    navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden ${done ? "opacity-60" : ""}`}>

      {/* ── 카드 본문 ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5 shrink-0">{tc.icon}</span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs text-gray-400 font-medium">[{tc.label}]</span>
              <span className="text-sm font-semibold text-gray-900">{item.title}</span>
              <span className={`px-1.5 py-0.5 text-xs rounded font-semibold ${pc.cls}`}>{pc.label}</span>
              <span className={`px-1.5 py-0.5 text-xs rounded ${sc.cls}`}>{sc.label}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.description}</p>
            <Thumbs urls={item.image_urls} />
          </div>

          {/* 우측 액션 */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={copyOriginal} title="원본 복사"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors text-sm">
              {copied ? "✓" : "📋"}
            </button>
            {isAdmin && (
              <button onClick={() => onReply(item)} title="답변 / 수정"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-sm">✏️</button>
            )}
            {isAdmin && (
              <select value={item.status} onChange={e => setStatus(e.target.value as FStatus)}
                className="text-xs border border-gray-200 rounded-md px-1.5 py-1.5 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer">
                {(["pending","in_progress","resolved","done"] as FStatus[]).map(s => (
                  <option key={s} value={s}>{S_CFG[s].label}</option>
                ))}
              </select>
            )}
            {(isAdmin || myItem) && (
              <button onClick={del} title="삭제"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors text-sm">🗑</button>
            )}
          </div>
        </div>

        {/* 메타 줄 */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
            <span>{item.submitted_by ?? "익명"}</span>
            <span className="text-gray-200">·</span>
            <span>{fmt(item.created_at)}</span>
            {/* 확인 완료 버튼 */}
            {item.status === "resolved" && (isAdmin || myItem) && (
              <button onClick={() => setStatus("done")}
                className="ml-1 px-2.5 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded-full hover:bg-green-200 transition-colors font-medium">
                ✓ 확인 완료
              </button>
            )}
            {done && item.completed_at && (
              <span className="text-green-600 font-medium">완료 {fmt(item.completed_at)}</span>
            )}
          </div>
          <button onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors">
            💬 대화 <span className="text-gray-300">{open ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* ── 댓글 스레드 ──────────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4 space-y-3">

          {/* 관리자 공개 답변 (왼쪽 말풍선) */}
          {item.admin_reply && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">관</div>
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-blue-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{item.admin_reply}</p>
                  <Thumbs urls={item.reply_image_urls} />
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-1">관리자{item.replied_at ? ` · ${fmt(item.replied_at)}` : ""}</p>
              </div>
            </div>
          )}

          {/* 댓글 로딩 */}
          {!loaded && <p className="text-xs text-gray-400 text-center py-3">로딩 중…</p>}

          {/* 댓글 목록 */}
          {loaded && cmts.map(c => {
            const canDel = user?.id === c.user_id || isAdmin;
            return c.is_admin ? (
              /* 관리자 댓글 — 왼쪽 */
              <div key={c.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">관</div>
                <div className="flex-1 min-w-0">
                  <div className="bg-white border border-blue-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-1">
                    <span className="text-xs text-gray-400">{c.author_name ?? "관리자"} · {fmt(c.created_at)}</span>
                    {canDel && <button onClick={() => delComment(c.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors" title="삭제">🗑</button>}
                    <button onClick={() => copyPrompt(c)} className="text-xs text-gray-300 hover:text-blue-500 transition-colors" title="Claude 프롬프트 복사">🤖</button>
                  </div>
                </div>
              </div>
            ) : (
              /* 사용자 댓글 — 오른쪽 */
              <div key={c.id} className="flex gap-2.5 flex-row-reverse">
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                  {(c.author_name ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 flex flex-col items-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm max-w-[80%]">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.body}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 mr-1">
                    <button onClick={() => copyPrompt(c)} className="text-xs text-gray-300 hover:text-blue-500 transition-colors" title="Claude 프롬프트 복사">🤖</button>
                    {canDel && <button onClick={() => delComment(c.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors" title="삭제">🗑</button>}
                    <span className="text-xs text-gray-400">{fmt(c.created_at)} · {c.author_name ?? "익명"}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 빈 상태 */}
          {loaded && cmts.length === 0 && !item.admin_reply && (
            <p className="text-xs text-gray-400 text-center py-3">아직 대화가 없습니다.</p>
          )}

          {/* 댓글 입력 */}
          {!done && (
            <div className="flex gap-2 pt-1">
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
                placeholder="댓글을 입력하세요 (Enter 전송)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow-sm" />
              <button onClick={sendComment} disabled={sending || !text.trim()}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 shrink-0 font-medium transition-colors">
                전송
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const [user,        setUser]        = useState<SSOUser | null>(null);
  const [items,       setItems]       = useState<FeedbackItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<Tab>("all");
  const [showNew,     setShowNew]     = useState(false);
  const [replyItem,   setReplyItem]   = useState<FeedbackItem | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api("/api/feedback");
    if (r.ok) { const { requests } = await r.json(); setItems(requests ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { getCurrentUser().then(setUser); load(); }, [load]);

  function upd(id: string, p: Partial<FeedbackItem>) { setItems(prev => prev.map(i => i.id === id ? { ...i, ...p } : i)); }
  function del(id: string)                            { setItems(prev => prev.filter(i => i.id !== id)); }

  const all      = tab === "all" ? items : items.filter(i => i.status === tab);
  const active   = all.filter(i => i.status !== "done");
  const done     = all.filter(i => i.status === "done");
  const counts   = TABS.reduce((acc, t) => ({ ...acc, [t]: t === "all" ? items.length : items.filter(i => i.status === t).length }), {} as Record<Tab, number>);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">오류 신고 & 기능 개발</h1>
          <p className="text-sm text-gray-500 mt-0.5">버그 보고 · 기능 요청 · 개선 제안</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          + 오류 신고 & 기능 개발
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${tab===t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {TAB_LABEL[t]}
            {counts[t] > 0 && <span className={`ml-1 ${tab===t ? "text-blue-600" : "text-gray-400"}`}>{counts[t]}</span>}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">로딩 중…</div>
      ) : (
        <div className="space-y-3">
          {active.map(item => (
            <Card key={item.id} item={item} user={user} isAdmin={isAdmin}
              onUpdate={upd} onDelete={del} onReply={setReplyItem} />
          ))}
          {active.length === 0 && (
            <div className="text-center py-14 text-gray-400 text-sm">해당 항목이 없습니다.</div>
          )}
          {done.length > 0 && (
            <>
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400 shrink-0">완료 {done.length}건</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              {done.map(item => (
                <Card key={item.id} item={item} user={user} isAdmin={isAdmin}
                  onUpdate={upd} onDelete={del} onReply={setReplyItem} />
              ))}
            </>
          )}
        </div>
      )}

      {showNew   && <NewModal   user={user}   onClose={() => setShowNew(false)}    onDone={load} />}
      {replyItem && <ReplyModal item={replyItem} onClose={() => setReplyItem(null)} onDone={load} />}
    </div>
  );
}
