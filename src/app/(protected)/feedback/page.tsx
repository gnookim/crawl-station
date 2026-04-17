"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getCurrentUser, getAuthHeaders } from "@/lib/sso";
import type { SSOUser } from "@/lib/sso";

// ─── Types ───────────────────────────────────────────────────────────────────

type FeedbackType     = "bug" | "feature" | "improvement";
type FeedbackPriority = "high" | "medium" | "low";
type FeedbackStatus   = "pending" | "in_progress" | "resolved" | "done";
type FilterTab        = "all" | FeedbackStatus;

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  title: string;
  description: string;
  status: FeedbackStatus;
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

interface FeedbackComment {
  id: string;
  feedback_id: string;
  user_id: string | null;
  author_name: string | null;
  is_admin: boolean;
  body: string;
  created_at: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<FeedbackType, { icon: string; label: string }> = {
  bug:         { icon: "🐛", label: "버그" },
  feature:     { icon: "💡", label: "기능" },
  improvement: { icon: "🔧", label: "개선" },
};

const PRIORITY_CFG: Record<FeedbackPriority, { label: string; cls: string }> = {
  high:   { label: "HIGH",   cls: "bg-red-100 text-red-700" },
  medium: { label: "MEDIUM", cls: "bg-amber-100 text-amber-700" },
  low:    { label: "LOW",    cls: "bg-blue-100 text-blue-600" },
};

const STATUS_CFG: Record<FeedbackStatus, { label: string; cls: string }> = {
  pending:     { label: "접수",     cls: "bg-gray-100 text-gray-600" },
  in_progress: { label: "처리중",   cls: "bg-blue-100 text-blue-700" },
  resolved:    { label: "확인요청", cls: "bg-amber-100 text-amber-700" },
  done:        { label: "완료",     cls: "bg-green-100 text-green-700" },
};

const TAB_LABELS: Record<FilterTab, string> = {
  all:         "전체",
  pending:     "접수",
  in_progress: "처리중",
  resolved:    "확인요청",
  done:        "완료",
};

const TABS: FilterTab[] = ["all", "pending", "in_progress", "resolved", "done"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...init,
    headers: { ...authHeaders, ...(init?.headers ?? {}) },
  });
}

// ─── ImageUploader ────────────────────────────────────────────────────────────

function ImageUploader({
  value, onChange, max,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || uploading) return;
    const toUpload = Array.from(files).slice(0, max - value.length);
    setUploading(true);
    try {
      const urls = await Promise.all(
        toUpload.map(async (file) => {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/feedback/upload", { method: "POST", body: form });
          if (!res.ok) throw new Error("업로드 실패");
          const { url } = await res.json();
          return url as string;
        })
      );
      onChange([...value, ...urls]);
    } catch {
      alert("이미지 업로드에 실패했습니다. 파일 크기(5MB 이하)와 형식을 확인해 주세요.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((url, i) => (
          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              ✕
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-40 text-xs gap-0.5">
            {uploading ? (
              <span className="text-base animate-spin">⟳</span>
            ) : (
              <>
                <span className="text-xl leading-none">+</span>
                <span>사진</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-gray-400">최대 {max}장 · JPG/PNG/GIF/WEBP · 5MB 이하</p>
    </div>
  );
}

// ─── ImageThumbnails ──────────────────────────────────────────────────────────

function ImageThumbnails({ urls }: { urls: string[] | null }) {
  if (!urls?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-14 h-14 rounded-md overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
        </a>
      ))}
    </div>
  );
}

// ─── NewRequestModal ──────────────────────────────────────────────────────────

function NewRequestModal({
  user, onClose, onCreated,
}: {
  user: SSOUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type,        setType]        = useState<FeedbackType>("feature");
  const [priority,    setPriority]    = useState<FeedbackPriority>("medium");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [submittedBy, setSubmittedBy] = useState(user?.name ?? "");
  const [images,      setImages]      = useState<string[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState("");

  async function submit() {
    if (!title.trim() || !description.trim()) {
      setErr("제목과 내용은 필수입니다."); return;
    }
    setSaving(true); setErr("");
    const res = await apiFetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type, priority,
        title: title.trim(),
        description: description.trim(),
        submitted_by: submittedBy.trim() || null,
        image_urls: images,
      }),
    });
    if (res.ok) {
      onCreated();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "제출에 실패했습니다.");
    }
    setSaving(false);
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">의견 및 개발 요청</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full text-lg leading-none transition-colors">✕</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* 유형 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">유형</label>
            <div className="flex gap-2">
              {(["bug", "feature", "improvement"] as FeedbackType[]).map((t) => (
                <button
                  key={t} type="button" onClick={() => setType(t)}
                  className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${
                    type === t
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {TYPE_CFG[t].icon} {TYPE_CFG[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* 우선순위 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">우선순위</label>
            <div className="flex gap-2">
              {(["high", "medium", "low"] as FeedbackPriority[]).map((p) => (
                <button
                  key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${
                    priority === p
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}>
                  {PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              제목 <span className="text-red-400">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="요청 제목을 간결하게 입력하세요"
              className={inputCls}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              내용 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="상세 내용을 입력하세요. 버그인 경우 재현 절차를 포함해주세요."
              className={inputCls + " resize-none"}
            />
          </div>

          {/* 첨부 이미지 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">첨부 이미지 (최대 3장)</label>
            <ImageUploader value={images} onChange={setImages} max={3} />
          </div>

          {/* 제출자 이름 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              제출자 이름 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder={user?.name ?? "익명"}
              className={inputCls}
            />
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{err}</p>
          )}
        </div>

        {/* 하단 */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
            {saving ? "제출 중…" : "제출"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminReplyModal ──────────────────────────────────────────────────────────

function AdminReplyModal({
  item, onClose, onSaved,
}: {
  item: FeedbackItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reply,        setReply]        = useState(item.admin_reply ?? "");
  const [images,       setImages]       = useState<string[]>(item.reply_image_urls ?? []);
  const [markResolved, setMarkResolved] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState("");

  async function save() {
    setSaving(true); setErr("");
    const body: Record<string, unknown> = {
      admin_reply:      reply.trim() || null,
      reply_image_urls: images,
    };
    if (markResolved) body.status = "resolved";

    const res = await apiFetch(`/api/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "저장에 실패했습니다.");
    }
    setSaving(false);
  }

  const canMarkResolved = item.status !== "resolved" && item.status !== "done";

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">관리자 답변</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full text-lg leading-none transition-colors">✕</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* 요청 제목 참조 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{TYPE_CFG[item.type]?.icon} [{TYPE_CFG[item.type]?.label}] · {PRIORITY_CFG[item.priority]?.label}</p>
            <p className="text-sm font-medium text-gray-800">{item.title}</p>
          </div>

          {/* 답변 내용 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">답변 내용</label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={6}
              placeholder="처리 내용, 결과 설명, 반영 버전 등을 입력하세요."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
            />
          </div>

          {/* 결과 캡처 이미지 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">결과 캡처 이미지 (최대 5장)</label>
            <ImageUploader value={images} onChange={setImages} max={5} />
          </div>

          {/* 확인 요청 전환 */}
          {canMarkResolved && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={markResolved}
                onChange={(e) => setMarkResolved(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
              />
              <span className="text-sm text-gray-700">저장 시 <strong className="text-amber-600">확인 요청</strong> 상태로 전환</span>
            </label>
          )}

          {err && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{err}</p>
          )}
        </div>

        {/* 하단 */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FeedbackCard ─────────────────────────────────────────────────────────────

function FeedbackCard({
  item, user, isAdmin, onUpdate, onDelete, onReply,
}: {
  item: FeedbackItem;
  user: SSOUser | null;
  isAdmin: boolean;
  onUpdate: (id: string, updates: Partial<FeedbackItem>) => void;
  onDelete: (id: string) => void;
  onReply: (item: FeedbackItem) => void;
}) {
  const [expanded,       setExpanded]       = useState(false);
  const [comments,       setComments]       = useState<FeedbackComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentBody,    setCommentBody]    = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [copied,         setCopied]         = useState(false);

  const tcfg = TYPE_CFG[item.type]     ?? TYPE_CFG.feature;
  const pcfg = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG.medium;
  const scfg = STATUS_CFG[item.status] ?? STATUS_CFG.pending;
  const isDone = item.status === "done";
  const canConfirmDone = item.status === "resolved" && user && (user.id === item.user_id || isAdmin);

  // 댓글 로드 (확장 시 1회)
  useEffect(() => {
    if (expanded && !commentsLoaded) {
      apiFetch(`/api/feedback/${item.id}/comments`)
        .then((r) => r.json())
        .then(({ comments: data }) => { setComments(data ?? []); setCommentsLoaded(true); })
        .catch(() => setCommentsLoaded(true));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function submitComment() {
    if (!commentBody.trim() || submitting) return;
    setSubmitting(true);
    const res = await apiFetch(`/api/feedback/${item.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody.trim(), author_name: user?.name ?? undefined }),
    });
    if (res.ok) {
      const { comment } = await res.json();
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    }
    setSubmitting(false);
  }

  async function deleteComment(cid: string) {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const res = await apiFetch(`/api/feedback/${item.id}/comments/${cid}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== cid));
  }

  async function changeStatus(status: FeedbackStatus) {
    const res = await apiFetch(`/api/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updates: Partial<FeedbackItem> = { status };
      if (status === "done") updates.completed_at = new Date().toISOString();
      onUpdate(item.id, updates);
    }
  }

  async function confirmDone() {
    if (!confirm("확인 완료 처리하시겠습니까?")) return;
    changeStatus("done");
  }

  async function deleteItem() {
    if (!confirm("이 항목을 삭제하시겠습니까? 댓글도 함께 삭제됩니다.")) return;
    const res = await apiFetch(`/api/feedback/${item.id}`, { method: "DELETE" });
    if (res.ok) onDelete(item.id);
  }

  // ─── 복사 ─────────────────────────────────────────────────────────────────

  function copyOriginal() {
    const lines: string[] = [
      `${tcfg.icon} [${tcfg.label}] ${item.title}  ${pcfg.label} · ${scfg.label}`,
      "",
      "📝 내용",
      item.description,
    ];
    if (item.image_urls?.length) {
      lines.push("", "📎 첨부 이미지");
      item.image_urls.forEach((u) => lines.push(u));
    }
    lines.push(
      "",
      "---",
      `제출자: ${item.submitted_by ?? "익명"} | ${fmtDate(item.created_at)} | ID: ${item.id}`,
    );
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function copyClaudePrompt(comment: FeedbackComment) {
    const upTo = comments.slice(0, comments.indexOf(comment) + 1);
    const lines: string[] = [
      "아래 원본 요청과 처리 내용을 바탕으로 추가 수정 요청을 반영해줘.",
      "",
      `## 원본 요청 (${tcfg.label} · ${pcfg.label})`,
      `제목: ${item.title}`,
      "",
      item.description,
    ];
    if (item.image_urls?.length) {
      lines.push("", "📎 첨부:");
      item.image_urls.forEach((u) => lines.push(u));
    }
    if (item.admin_reply) {
      lines.push("", "## 처리된 내용", item.admin_reply);
      if (item.reply_image_urls?.length) {
        lines.push("", "처리 결과 캡처:");
        item.reply_image_urls.forEach((u) => lines.push(u));
      }
    }
    if (upTo.length > 0) {
      lines.push("", "## 추가 수정 요청 (대화)");
      upTo.forEach((c) => {
        const prefix = c.is_admin ? "[관리자]" : `[${c.author_name ?? "사용자"}]`;
        lines.push(`${prefix} ${c.body}`);
      });
    }
    lines.push("", "---", `ID: ${item.id} | 제출자: ${item.submitted_by ?? "익명"}`);
    navigator.clipboard.writeText(lines.join("\n"));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-opacity ${isDone ? "opacity-60" : ""}`}>
      {/* ── 카드 본문 ── */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          {/* 타입 아이콘 */}
          <span className="text-xl mt-0.5 shrink-0">{tcfg.icon}</span>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            {/* 제목 줄 */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs text-gray-400 font-medium">[{tcfg.label}]</span>
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
              <span className={`px-1.5 py-0.5 text-xs rounded font-semibold ${pcfg.cls}`}>{pcfg.label}</span>
              <span className={`px-1.5 py-0.5 text-xs rounded ${scfg.cls}`}>{scfg.label}</span>
            </div>
            {/* 본문 */}
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{item.description}</p>
            {/* 첨부 이미지 */}
            <ImageThumbnails urls={item.image_urls} />
          </div>

          {/* ── 우측 액션 버튼들 ── */}
          <div className="flex items-center gap-1 shrink-0">
            {/* 원본 복사 */}
            <button
              onClick={copyOriginal}
              title="원본 복사"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors text-sm">
              {copied ? "✓" : "📋"}
            </button>
            {/* 관리자: 답변/수정 */}
            {isAdmin && (
              <button
                onClick={() => onReply(item)}
                title="답변 / 수정"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-sm">
                ✏️
              </button>
            )}
            {/* 관리자: 상태 변경 드롭다운 */}
            {isAdmin && (
              <select
                value={item.status}
                onChange={(e) => changeStatus(e.target.value as FeedbackStatus)}
                className="text-xs border border-gray-200 rounded-md px-1.5 py-1.5 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer">
                {(["pending", "in_progress", "resolved", "done"] as FeedbackStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                ))}
              </select>
            )}
            {/* 삭제 (관리자 또는 본인) */}
            {(isAdmin || user?.id === item.user_id) && (
              <button
                onClick={deleteItem}
                title="삭제"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors text-sm">
                🗑
              </button>
            )}
          </div>
        </div>

        {/* ── 하단 메타 ── */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">{item.submitted_by ?? "익명"}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">{fmtDate(item.created_at)}</span>
            {/* 확인 완료 버튼 */}
            {canConfirmDone && (
              <button
                onClick={confirmDone}
                className="ml-1 px-2.5 py-0.5 text-xs bg-green-100 text-green-700 border border-green-200 rounded-full hover:bg-green-200 transition-colors font-medium">
                ✓ 확인 완료
              </button>
            )}
            {isDone && item.completed_at && (
              <span className="text-xs text-green-600 font-medium">완료 {fmtDate(item.completed_at)}</span>
            )}
          </div>
          {/* 대화 펼치기 */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors px-2 py-1 rounded-md hover:bg-blue-50">
            💬 대화
            <span className="text-gray-300">{expanded ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* ── 댓글 스레드 ── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-4 space-y-3">
          {/* 관리자 공개 답변 (말풍선 — 왼쪽) */}
          {item.admin_reply && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-sm">관</div>
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-blue-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{item.admin_reply}</p>
                  <ImageThumbnails urls={item.reply_image_urls} />
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-1">
                  관리자{item.replied_at ? ` · ${fmtDate(item.replied_at)}` : ""}
                </p>
              </div>
            </div>
          )}

          {/* 댓글 로딩 */}
          {!commentsLoaded && (
            <p className="text-xs text-gray-400 text-center py-3">로딩 중…</p>
          )}

          {/* 댓글 목록 */}
          {commentsLoaded && comments.map((c) => {
            const canDel = user?.id === c.user_id || isAdmin;
            return c.is_admin ? (
              /* 관리자 댓글 — 왼쪽 */
              <div key={c.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-sm">관</div>
                <div className="flex-1 min-w-0">
                  <div className="bg-white border border-blue-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-1">
                    <span className="text-xs text-gray-400">{c.author_name ?? "관리자"} · {fmtDate(c.created_at)}</span>
                    {canDel && (
                      <button onClick={() => deleteComment(c.id)} title="삭제"
                        className="text-xs text-gray-300 hover:text-red-400 transition-colors">🗑</button>
                    )}
                    <button onClick={() => copyClaudePrompt(c)} title="Claude 프롬프트 복사"
                      className="text-xs text-gray-300 hover:text-blue-500 transition-colors">🤖</button>
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
                    <button onClick={() => copyClaudePrompt(c)} title="Claude 프롬프트 복사"
                      className="text-xs text-gray-300 hover:text-blue-500 transition-colors">🤖</button>
                    {canDel && (
                      <button onClick={() => deleteComment(c.id)} title="삭제"
                        className="text-xs text-gray-300 hover:text-red-400 transition-colors">🗑</button>
                    )}
                    <span className="text-xs text-gray-400">{fmtDate(c.created_at)} · {c.author_name ?? "익명"}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* 빈 상태 */}
          {commentsLoaded && comments.length === 0 && !item.admin_reply && (
            <p className="text-xs text-gray-400 text-center py-3">아직 대화가 없습니다.</p>
          )}

          {/* 댓글 입력 (done 제외) */}
          {!isDone && (
            <div className="flex gap-2 pt-1">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); }
                }}
                placeholder="댓글을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow-sm"
              />
              <button
                onClick={submitComment}
                disabled={submitting || !commentBody.trim()}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 shrink-0 font-medium shadow-sm transition-colors">
                전송
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const [user,        setUser]        = useState<SSOUser | null>(null);
  const [items,       setItems]       = useState<FeedbackItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<FilterTab>("all");
  const [showNew,     setShowNew]     = useState(false);
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);

  const isAdmin = user?.role === "admin";

  const loadItems = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/feedback");
    if (res.ok) {
      const { requests } = await res.json();
      setItems(requests ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    getCurrentUser().then(setUser);
    loadItems();
  }, [loadItems]);

  function handleUpdate(id: string, updates: Partial<FeedbackItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    // 답변 모달에서 reload하므로 여기선 로컬 업데이트만
  }
  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const active   = filtered.filter((i) => i.status !== "done");
  const done     = filtered.filter((i) => i.status === "done");

  const tabCounts: Record<FilterTab, number> = {
    all:         items.length,
    pending:     items.filter((i) => i.status === "pending").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    resolved:    items.filter((i) => i.status === "resolved").length,
    done:        items.filter((i) => i.status === "done").length,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">피드백</h1>
          <p className="text-sm text-gray-500 mt-0.5">버그 보고 · 기능 요청 · 개선 제안</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          + 의견 및 개발 요청
        </button>
      </div>

      {/* ── 탭 필터 ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              filter === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}>
            {TAB_LABELS[t]}
            {tabCounts[t] > 0 && (
              <span className={`ml-1 ${filter === t ? "text-blue-600" : "text-gray-400"}`}>
                {tabCounts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 목록 ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">로딩 중…</div>
      ) : (
        <div className="space-y-3">
          {/* 진행 중 항목 */}
          {active.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              user={user}
              isAdmin={isAdmin}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onReply={setReplyTarget}
            />
          ))}

          {active.length === 0 && (
            <div className="text-center py-14 text-gray-400 text-sm">해당 항목이 없습니다.</div>
          )}

          {/* 완료 구분선 */}
          {done.length > 0 && (active.length > 0 || filter === "all") && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-gray-200" />
              <span className="text-xs text-gray-400 shrink-0">완료 {done.length}건</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
          )}

          {/* 완료 항목 */}
          {done.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              user={user}
              isAdmin={isAdmin}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onReply={setReplyTarget}
            />
          ))}
        </div>
      )}

      {/* ── 모달 ── */}
      {showNew && (
        <NewRequestModal
          user={user}
          onClose={() => setShowNew(false)}
          onCreated={loadItems}
        />
      )}
      {replyTarget && (
        <AdminReplyModal
          item={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSaved={loadItems}
        />
      )}
    </div>
  );
}
