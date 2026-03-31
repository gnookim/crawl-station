"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/workers", label: "워커 관리", icon: "🖥️" },
  { href: "/queue", label: "작업 큐", icon: "📋" },
  { href: "/releases", label: "릴리즈", icon: "🚀" },
  { href: "/install", label: "워커 설치", icon: "⬇️" },
  { href: "/guide", label: "연동 가이드", icon: "📖" },
  { href: "/changelog", label: "업데이트 기록", icon: "📝" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">CrawlStation</h1>
        <p className="text-xs text-gray-500 mt-0.5">크롤링 관제 시스템</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
        CrawlStation v0.1
      </div>
    </aside>
  );
}
