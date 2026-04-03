export function WorkerStatusBadge({
  status,
}: {
  status: string;
}) {
  const config: Record<string, { label: string; color: string; dot: string; desc: string }> = {
    online: { label: "온라인", color: "bg-green-50 text-green-700", dot: "bg-green-500", desc: "워커 연결됨" },
    idle: { label: "대기", color: "bg-green-50 text-green-700", dot: "bg-green-500", desc: "실행 중, 작업 대기" },
    crawling: { label: "작업 중", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500", desc: "크롤링 실행 중" },
    blocked: { label: "차단", color: "bg-yellow-50 text-yellow-700", dot: "bg-yellow-500", desc: "봇 탐지 등으로 차단됨" },
    offline: { label: "오프라인", color: "bg-gray-100 text-gray-500", dot: "bg-gray-400", desc: "30초 이상 응답 없음" },
  };

  const c = config[status] || config.offline;

  return (
    <span
      title={c.desc}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.color} cursor-help`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    pending: { label: "대기", color: "bg-gray-100 text-gray-600" },
    assigned: { label: "할당됨", color: "bg-yellow-50 text-yellow-700" },
    running: { label: "실행 중", color: "bg-blue-50 text-blue-700" },
    completed: { label: "완료", color: "bg-green-50 text-green-700" },
    failed: { label: "실패", color: "bg-red-50 text-red-700" },
  };

  const c = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}
