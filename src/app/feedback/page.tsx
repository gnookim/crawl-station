"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Bug, Lightbulb, Wrench, ChevronDown, ImagePlus, X, Trash2, Copy, Check, CheckCircle2, MessageCircle, Send, ChevronUp, Bot } from "lucide-react";

type FeedbackType = "bug" | "feature" | "improvement";
type FeedbackPriority = "high" | "medium" | "low";
type FeedbackStatus = "pending" | "in_progress" | "resolved" | "done";

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
  replied_at: string | null;
  completed_at: string | null;
  created_at: string;
  image_urls: string[] | null;
  reply_image_urls: string[] | null;
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

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: React.ReactNode; color: string }> = {
  bug:         { label: "버그",   icon: <Bug size={16} />,       color: "text-red-500"    },
  feature:     { label: "기능",   icon: <Lightbulb size={16} />, color: "text-blue-500"   },
  improvement: { label: "개선",   icon: <Wrench size={16} />,    color: "text-orange-500" },
};

const PRIORITY_CONFIG: Record<FeedbackPriority, { label: string; badge: string }> = {
  high:   { label: "HIGH",   badge: "bg-red-100 text-red-700"       },
  medium: { label: "MEDIUM", badge: "bg-yellow-100 text-yellow-700" },
  low:    { label: "LOW",    badge: "bg-green-100 text-green-700"   },
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; badge: string }> = {
  pending:     { label: "접수",      badge: "bg-gray-100 text-gray-600"     },
  in_progress: { label: "처리중",    badge: "bg-blue-100 text-blue-700"     },
  resolved:    { label: "확인 요청", badge: "bg-orange-100 text-orange-700" },
  done:        { label: "완료",      badge: "bg-green-100 text-green-700"   },
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all",         label: "전체"      },
  { key: "pending",     label: "접수"      },
  { key: "in_progress", label: "처리중"    },
  { key: "resolved",    label: "확인 요청" },
  { key: "done",        label: "완료"      },
];

const TYPE_EMOJI: Record<FeedbackType, string> = {
  bug: "🐛", feature: "💡", improvement: "🔧",
};
const PRIORITY_EMOJI: Record<FeedbackPriority, string> = {
  high: "🔴", medium: "🟡", low: "🟢",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) + " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function formatDateFull(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) + " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 원본 요청만 복사 (댓글·답변 제외) */
function buildCopyText(item: FeedbackItem): string {
  const typeLabel = TYPE_CONFIG[item.type].label;
  const priorityLabel = PRIORITY_CONFIG[item.priority].label;
  const statusLabel = STATUS_CONFIG[item.status].label;

  const lines: string[] = [];
  lines.push(`${TYPE_EMOJI[item.type]} [${typeLabel}] ${item.title} ${PRIORITY_EMOJI[item.priority]} ${priorityLabel} · ${statusLabel}`);
  lines.push("");
  lines.push("📋 내용");
  lines.push(item.description);

  if (item.image_urls && item.image_urls.length > 0) {
    lines.push("");
    lines.push("🖼 첨부 이미지");
    item.image_urls.forEach(url => lines.push(url));
  }

  lines.push("");
  lines.push("---");
  lines.push(`제출자: ${item.submitted_by ?? "익명"} | ${formatDateFull(item.created_at)} | ID: ${item.id}`);

  return lines.join("\n");
}

/** 대화 내용 기반 Claude 작업 프롬프트 생성 */
function buildPromptText(item: FeedbackItem, comments: FeedbackComment[]): string {
  const typeLabel = TYPE_CONFIG[item.type].label;
  const priorityLabel = PRIORITY_CONFIG[item.priority].label;

  const lines: string[] = [];
  lines.push(`아래 요청 사항과 처리 내용을 바탕으로 추가 수정 요청을 반영해줘.`);
  lines.push("");
  lines.push(`## 원래 요청 (${typeLabel} · ${priorityLabel})`);
  lines.push(`제목: ${item.title}`);
  lines.push("");
  lines.push(item.description);

  if (item.image_urls && item.image_urls.length > 0) {
    lines.push("");
    lines.push("첨부 이미지:");
    item.image_urls.forEach(url => lines.push(url));
  }

  if (item.admin_reply) {
    lines.push("");
    lines.push("## 처리된 내용");
    lines.push(item.admin_reply);
    if (item.reply_image_urls && item.reply_image_urls.length > 0) {
      lines.push("");
      lines.push("처리 결과 캡처:");
      item.reply_image_urls.forEach(url => lines.push(url));
    }
  }

  if (comments.length > 0) {
    lines.push("");
    lines.push("## 추가 수정 요청 (대화)");
    comments.forEach(c => {
      const author = c.is_admin ? "관리자" : (c.author_name ?? "요청자");
      lines.push(`[${author}] ${c.body}`);
    });
  }

  lines.push("");
  lines.push("---");
  lines.push(`ID: ${item.id} | 제출자: ${item.submitted_by ?? "익명"}`);

  return lines.join("\n");
}

// ─── 새 요청 모달 ───────────────────────────────────────────
function NewFeedbackModal({
  onClose, onSubmit, defaultName,
}: {
  onClose: () => void;
  onSubmit: (data: { type: FeedbackType; priority: FeedbackPriority; title: string; description: string; submitted_by: string; image_urls: string[] }) => Promise<void>;
  defaultName: string;
}) {
  const [type, setType] = useState<FeedbackType>("feature");
  const [priority, setPriority] = useState<FeedbackPriority>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submittedBy, setSubmittedBy] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<{ file: File; preview: string; url?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSubmittedBy(defaultName); }, [defaultName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 3) { alert("이미지는 최대 3장까지 첨부 가능합니다"); return; }
    setImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
    e.target.value = "";
  };

  const removeImage = (i: number) => {
    setImages(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, idx) => idx !== i); });
  };

  const uploadImages = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of images) {
      if (img.url) { urls.push(img.url); continue; }
      const fd = new FormData();
      fd.append("file", img.file);
      const res = await fetch("/api/feedback/upload", { method: "POST", body: fd });
      if (res.ok) { const d = await res.json(); urls.push(d.url); }
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    setUploading(images.length > 0);
    try {
      const image_urls = await uploadImages();
      setUploading(false);
      await onSubmit({ type, priority, title: title.trim(), description: description.trim(), submitted_by: submittedBy.trim(), image_urls });
      onClose();
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">수정 및 개발 요청</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">유형</label>
            <div className="flex gap-2">
              {(["bug", "feature", "improvement"] as FeedbackType[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${type === t ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  <span className={TYPE_CONFIG[t].color}>{TYPE_CONFIG[t].icon}</span>
                  {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">우선순위</label>
            <div className="flex gap-2">
              {(["high", "medium", "low"] as FeedbackPriority[]).map(p => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${priority === p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">제목 <span className="text-red-400">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="간단한 제목을 입력하세요"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">설명 <span className="text-red-400">*</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="자세한 내용을 입력하세요"
              rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">이미지 첨부 (선택, 최대 3장)</label>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 text-white rounded-full flex items-center justify-center">
                    <X size={10} />
                  </button>
                </div>
              ))}
              {images.length < 3 && (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors text-xs">
                  <ImagePlus size={18} />추가
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50">
            <span className="text-sm">👤</span>
            <span className="text-sm font-medium text-gray-700">{submittedBy || "(로그인 정보 없음)"}</span>
            <span className="text-xs text-gray-400 ml-auto">자동 입력</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">취소</button>
            <button type="submit" disabled={submitting || !title.trim() || !description.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {uploading ? "이미지 업로드 중..." : submitting ? "제출 중..." : "제출"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 관리자 응답 모달 ────────────────────────────────────────
function ReplyModal({
  feedback, onClose, onSave,
}: {
  feedback: FeedbackItem;
  onClose: () => void;
  onSave: (id: string, reply: string, markDone: boolean, imageUrls: string[]) => Promise<void>;
}) {
  const [reply, setReply] = useState(feedback.admin_reply ?? "");
  const [markDone, setMarkDone] = useState(feedback.status !== "resolved" && feedback.status !== "done");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [images, setImages] = useState<{ file: File; preview: string; url?: string }[]>(
    (feedback.reply_image_urls ?? []).map(url => ({ file: new File([], ""), preview: url, url }))
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 5) { alert("이미지는 최대 5장까지 첨부 가능합니다"); return; }
    setImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
    e.target.value = "";
  };

  const removeImage = (i: number) => {
    setImages(prev => {
      if (!prev[i].url) URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of images) {
      if (img.url) { urls.push(img.url); continue; }
      const fd = new FormData();
      fd.append("file", img.file);
      const res = await fetch("/api/feedback/upload", { method: "POST", body: fd });
      if (res.ok) { const d = await res.json(); urls.push(d.url); }
    }
    return urls;
  };

  const handleSave = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    setSaveError(null);
    setUploading(images.some(i => !i.url));
    try {
      const imageUrls = await uploadImages();
      setUploading(false);
      await onSave(feedback.id, reply, markDone, imageUrls);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">처리 결과 답변</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-500 font-medium truncate">{feedback.title}</p>
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder={"어떻게 처리됐는지 설명해 주세요\n예) v1.4.0에서 캠페인 기간을 직접 지정하도록 개선했습니다. 확인 부탁드려요."}
            rows={4} autoFocus
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none" />

          {/* 이미지 첨부 */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">처리 결과 캡처 이미지 <span className="text-gray-400">(선택, 최대 5장)</span></p>
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 text-white rounded-full flex items-center justify-center">
                    <X size={9} />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors text-[10px]">
                  <ImagePlus size={15} />추가
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={markDone} onChange={e => setMarkDone(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
            <span className="text-xs text-gray-600">답변 저장 후 <span className="font-medium text-orange-600">확인 요청</span> 상태로 전환</span>
          </label>
          {saveError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">취소</button>
            <button onClick={handleSave} disabled={saving || !reply.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {uploading ? "업로드 중..." : saving ? "저장 중..." : "답변 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 댓글 스레드 ─────────────────────────────────────────────
function CommentThread({
  feedbackId,
  adminReply,
  repliedAt,
  replyImageUrls,
  isDone,
  currentUserId,
  currentUserName,
  isAdmin,
  item,
}: {
  feedbackId: string;
  adminReply: string | null;
  repliedAt: string | null;
  replyImageUrls: string[] | null;
  isDone: boolean;
  currentUserId: string | null;
  currentUserName: string;
  isAdmin: boolean;
  item: FeedbackItem;
}) {
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePromptCopy = async (comment: FeedbackComment) => {
    // 해당 댓글까지 누적된 대화 전체를 포함
    const upToThis = comments.slice(0, comments.indexOf(comment) + 1);
    const text = buildPromptText(item, upToThis);
    await navigator.clipboard.writeText(text);
    setPromptCopiedId(comment.id);
    setTimeout(() => setPromptCopiedId(null), 2000);
  };

  useEffect(() => {
    fetch(`/api/feedback/${feedbackId}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => { if (Array.isArray(data)) setComments(data); })
      .catch(() => {});
  }, [feedbackId]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: input.trim(), author_name: currentUserName || undefined }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [...prev, newComment]);
        setInput("");
      }
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (cid: string) => {
    const res = await fetch(`/api/feedback/${feedbackId}/comments/${cid}`, { method: "DELETE" });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== cid));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
  };

  const hasContent = adminReply || comments.length > 0;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
      {/* 관리자 공식 답변 (첫 번째 말풍선) */}
      {adminReply && (
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">관</div>
          <div className="flex-1">
            <div className="bg-blue-50 rounded-lg rounded-tl-none px-3 py-2">
              <p className="text-xs text-blue-800 whitespace-pre-wrap">{adminReply}</p>
              {replyImageUrls && replyImageUrls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {replyImageUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-24 h-24 object-cover rounded-lg border border-blue-100 hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 ml-1">{repliedAt ? formatDate(repliedAt) : ""}</p>
          </div>
        </div>
      )}

      {/* 댓글 목록 */}
      {comments.map(c => {
        const isMyComment = currentUserId && c.user_id === currentUserId;
        const canDelete = isAdmin || isMyComment;
        return (
          <div key={c.id} className={`flex gap-2 ${c.is_admin ? "" : "flex-row-reverse"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5 ${c.is_admin ? "bg-blue-600" : "bg-gray-400"}`}>
              {c.is_admin ? "관" : (c.author_name?.[0] ?? "?").toUpperCase()}
            </div>
            <div className={`flex-1 ${c.is_admin ? "" : "flex flex-col items-end"}`}>
              <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-xs whitespace-pre-wrap ${
                c.is_admin ? "bg-blue-50 text-blue-800 rounded-tl-none" : "bg-gray-100 text-gray-800 rounded-tr-none"
              }`}>
                {c.body}
              </div>
              <div className={`flex items-center gap-1.5 mt-0.5 ml-1 ${c.is_admin ? "" : "flex-row-reverse mr-1"}`}>
                <span className="text-[10px] text-gray-400">{c.author_name ?? (c.is_admin ? "관리자" : "익명")} · {formatDate(c.created_at)}</span>
                {canDelete && (
                  <button onClick={() => handleDelete(c.id)} className="text-gray-300 hover:text-red-400 transition-colors" title="삭제">
                    <Trash2 size={10} />
                  </button>
                )}
                <button
                  onClick={() => handlePromptCopy(c)}
                  title="이 댓글 기준으로 Claude 작업 프롬프트 복사"
                  className={`transition-colors ${promptCopiedId === c.id ? "text-purple-500" : "text-gray-300 hover:text-purple-400"}`}
                >
                  {promptCopiedId === c.id ? <Check size={10} /> : <Bot size={10} />}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {!hasContent && !isDone && (
        <p className="text-xs text-gray-400 text-center py-1">아직 대화가 없습니다</p>
      )}

      {/* 입력창 */}
      {!isDone && (
        <div className="flex gap-2 pt-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`댓글 입력 (Cmd+Enter로 전송)${isAdmin ? " — 관리자로 작성됩니다" : ""}`}
            rows={2}
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 피드백 카드 ─────────────────────────────────────────────
function FeedbackCard({
  item, currentUserId, currentUserName, isAdmin,
  onStatusChange, onReply, onDelete, onConfirm,
}: {
  item: FeedbackItem;
  currentUserId: string | null;
  currentUserName: string;
  isAdmin: boolean;
  onStatusChange: (id: string, status: FeedbackStatus) => Promise<void>;
  onReply: (item: FeedbackItem) => void;
  onDelete: (id: string) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
}) {
  const typeConf = TYPE_CONFIG[item.type];
  const priorityConf = PRIORITY_CONFIG[item.priority];
  const statusConf = STATUS_CONFIG[item.status];
  const isDone = item.status === "done";
  const [copied, setCopied] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [commentCount, setCommentCount] = useState<number | null>(null);

  // 댓글 수 미리 로드 (카드 렌더 시)
  useEffect(() => {
    fetch(`/api/feedback/${item.id}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setComments(data as FeedbackComment[]);
          setCommentCount((data as FeedbackComment[]).length);
        }
      })
      .catch(() => {});
  }, [item.id]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildCopyText(item));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const threadCount = (item.admin_reply ? 1 : 0) + (commentCount ?? 0);

  return (
    <div className={`bg-white rounded-xl border p-4 ${isDone ? "border-l-4 border-l-green-400 border-t-gray-200 border-r-gray-200 border-b-gray-200" : "border-gray-200"}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${typeConf.color}`}>{typeConf.icon}</div>

        <div className="flex-1 min-w-0">
          {/* 제목 행 */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">{item.title}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priorityConf.badge}`}>{priorityConf.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusConf.badge}`}>{statusConf.label}</span>
          </div>

          {/* 본문 */}
          <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2">{item.description}</p>

          {/* 첨부 이미지 */}
          {item.image_urls && item.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {item.image_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                </a>
              ))}
            </div>
          )}

          {/* 요청자 확인 버튼 (resolved + 본인) */}
          {item.status === "resolved" && currentUserId && item.user_id === currentUserId && (
            <div className="mb-2">
              <button
                onClick={() => onConfirm(item.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle2 size={13} />
                확인 완료 — 처리됐습니다
              </button>
            </div>
          )}

          {/* 메타 */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
            <span>{item.submitted_by ?? "익명"}</span>
            <span>{formatDateFull(item.created_at)}</span>
            {item.completed_at && <span className="text-green-500">완료: {formatDateFull(item.completed_at)}</span>}
          </div>

          {/* 대화 토글 버튼 */}
          <button
            onClick={() => setThreadOpen(v => !v)}
            className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-blue-500 transition-colors"
          >
            <MessageCircle size={12} />
            {threadCount > 0 ? `대화 ${threadCount}개` : "대화 보기"}
            {threadOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* 댓글 스레드 */}
          {threadOpen && (
            <CommentThread
              feedbackId={item.id}
              adminReply={item.admin_reply}
              repliedAt={item.replied_at}
              replyImageUrls={item.reply_image_urls}
              isDone={isDone}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isAdmin={isAdmin}
              item={item}
            />
          )}
        </div>

        {/* 우측 액션 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <select value={item.status} onChange={e => onStatusChange(item.id, e.target.value as FeedbackStatus)}
              className="appearance-none pl-2 pr-6 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-blue-400 cursor-pointer">
              <option value="pending">접수</option>
              <option value="in_progress">처리중</option>
              <option value="resolved">확인 요청</option>
              <option value="done">완료</option>
            </select>
            <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <button onClick={handleCopy} title="Claude에 붙여넣기용으로 복사 (대화 포함)"
            className={`p-1.5 rounded-lg border transition-colors ${copied ? "border-green-300 bg-green-50 text-green-600" : "border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>

          <button onClick={() => onReply(item)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            {item.admin_reply ? "수정" : "응답"}
          </button>

          <button onClick={() => { if (confirm(`"${item.title}" 피드백을 삭제하시겠습니까?`)) onDelete(item.id); }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [replyTarget, setReplyTarget] = useState<FeedbackItem | null>(null);
  const [userName, setUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const r = await fetch("/api/users/me")
        if (r.ok) {
          const u = await r.json()
          if (u?.name) { setUserName(u.name); if (u?.id) setCurrentUserId(u.id); if (u?.role === "admin") setIsAdmin(true); return }
        }
      } catch {}
      try {
        const { getCurrentUser } = await import("@/lib/sso")
        const u = await getCurrentUser()
        if (u?.name) setUserName(u.name)
        if (u?.id) setCurrentUserId(u.id)
        if (u?.role === "admin") setIsAdmin(true)
      } catch {}
    }
    loadUser()
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feedback?status=${activeTab}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSubmit = async (data: { type: FeedbackType; priority: FeedbackPriority; title: string; description: string; submitted_by: string; image_urls: string[] }) => {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) fetchItems();
  };

  const handleStatusChange = async (id: string, status: FeedbackStatus) => {
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(prev => prev.map(item => item.id === id ? updated : item));
    }
  };

  const handleSaveReply = async (id: string, admin_reply: string, markDone: boolean, imageUrls: string[]) => {
    const body: Record<string, unknown> = { admin_reply, reply_image_urls: imageUrls };
    if (markDone) body.status = "resolved";
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `저장 실패 (${res.status})`);
    }
    const updated = await res.json();
    setItems(prev => prev.map(item => item.id === id ? updated : item));
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/feedback/${id}`, { method: "DELETE" });
    if (res.ok) setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleConfirm = async (id: string) => {
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(prev => prev.map(item => item.id === id ? updated : item));
    }
  };

  const activeItems = items.filter(i => i.status !== "done");
  const doneItems   = items.filter(i => i.status === "done");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">오류 신고 &amp; 기능 개발 요청</h1>
          <p className="text-sm text-gray-500 mt-0.5">버그 신고, 기능 요청, 개선 제안을 남겨주세요</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={15} />수정 및 개발 요청
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-100 pb-0">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">등록된 피드백이 없습니다</div>
      ) : (
        <div className="space-y-4">
          {activeItems.map(item => (
            <FeedbackCard key={item.id} item={item}
              currentUserId={currentUserId} currentUserName={userName} isAdmin={isAdmin}
              onStatusChange={handleStatusChange} onReply={setReplyTarget}
              onDelete={handleDelete} onConfirm={handleConfirm} />
          ))}
          {doneItems.length > 0 && (
            <>
              {activeItems.length > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 font-medium">완료된 항목</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              {doneItems.map(item => (
                <FeedbackCard key={item.id} item={item}
                  currentUserId={currentUserId} currentUserName={userName} isAdmin={isAdmin}
                  onStatusChange={handleStatusChange} onReply={setReplyTarget}
                  onDelete={handleDelete} onConfirm={handleConfirm} />
              ))}
            </>
          )}
        </div>
      )}

      {showNew && (
        <NewFeedbackModal onClose={() => setShowNew(false)} onSubmit={handleSubmit} defaultName={userName} />
      )}
      {replyTarget && (
        <ReplyModal feedback={replyTarget} onClose={() => setReplyTarget(null)} onSave={handleSaveReply} />
      )}
    </div>
  );
}
