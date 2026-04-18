"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthGuard";
import { ssoLogout, getAuthHeaders } from "@/lib/sso";

const NAV_GROUPS = [
  {
    label: "크롤링",
    items: [
      { href: "/", label: "대시보드", icon: "📊" },
      { href: "/workers", label: "워커 관리", icon: "🖥️" },
      { href: "/queue", label: "작업 큐", icon: "📋" },
      { href: "/config", label: "크롤링 전략", icon: "⚙️" },
    ],
  },
  {
    label: "설치",
    items: [
      { href: "/install", label: "워커 설치", icon: "⬇️" },
      { href: "/installs", label: "설치 모니터링", icon: "📡" },
      { href: "/releases", label: "릴리즈", icon: "🚀" },
      { href: "/worker-spec", label: "워커 기능 명세", icon: "🔬" },
    ],
  },
  {
    label: "채널",
    items: [
      { href: "/instagram-accounts", label: "Instagram 계정", icon: "📷" },
    ],
  },
  {
    label: "분석",
    items: [
      { href: "/ai-analysis", label: "차단 리스크(AI)", icon: "🤖" },
    ],
  },
  {
    label: "시스템",
    items: [
      { href: "/apps",      label: "연결된 앱",    icon: "🔑" },
      { href: "/guide",     label: "연동 가이드",  icon: "📖" },
      { href: "/changelog", label: "업데이트 기록", icon: "📝" },
      { href: "/feedback",  label: "오류 신고 & 기능 개발", icon: "💬" },
      { href: "/users",     label: "회원 관리",    icon: "👥" },
      { href: "/settings",  label: "시스템 설정",  icon: "🔧" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [collapsed,        setCollapsed]        = useState(false);
  const [mobileOpen,       setMobileOpen]       = useState(false);
  const [feedbackBadge,    setFeedbackBadge]    = useState(0);

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // 미해결 피드백 뱃지
  useEffect(() => {
    async function fetchBadge() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/feedback?count=true", { headers });
        if (res.ok) {
          const { unresolved } = await res.json();
          setFeedbackBadge(unresolved ?? 0);
        }
      } catch { /* 무시 */ }
    }
    fetchBadge();
    const id = setInterval(fetchBadge, 60_000); // 1분마다 갱신
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    await ssoLogout();
    router.push("/login");
  }

  type NavItem = { href: string; label: string; icon: string };
  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const badge = item.href === "/feedback" && feedbackBadge > 0 ? feedbackBadge : 0;
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
          collapsed ? "justify-center px-2" : ""
        } ${
          isActive
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <span className="shrink-0 text-base">{item.icon}</span>
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {badge > 0 && !collapsed && (
          <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
        {badge > 0 && collapsed && (
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </Link>
    );
  };

  return (
    <>
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 lg:hidden bg-white border border-gray-200 rounded-md p-2 shadow-sm"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* 사이드바 */}
      <aside
        className={`
          flex flex-col shrink-0 border-r border-gray-200 bg-white h-full transition-all duration-200
          ${collapsed ? "w-14" : "w-56"}
          fixed lg:relative z-40 lg:z-auto
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* 헤더 */}
        <div className={`border-b border-gray-200 flex items-center ${collapsed ? "p-2 justify-center" : "p-4"}`}>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-gray-900 truncate">CrawlStation</h1>
              <p className="text-xs text-gray-500 mt-0.5">크롤링 관제 시스템</p>
            </div>
          )}
          {/* 접기/펼치기 버튼 (데스크탑만) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0 transition-colors"
            title={collapsed ? "펼치기" : "접기"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-2 overflow-y-auto">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-3" : ""}>
              {!collapsed && (
                <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </div>
              )}
              {collapsed && gi > 0 && <div className="my-1 border-t border-gray-100" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <div key={item.href} className="relative">
                    <NavLink item={item} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* 사용자 영역 */}
        <div className="border-t border-gray-200">
          {user && (
            <div className={`p-2 space-y-1 ${collapsed ? "flex flex-col items-center" : ""}`}>
              {!collapsed && (
                <Link
                  href="/my-account"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 truncate">{user.name || "이름 없음"}</div>
                    <div className="text-xs text-gray-400 truncate">{user.email}</div>
                  </div>
                </Link>
              )}
              {collapsed && (
                <Link
                  href="/my-account"
                  title={user.name || user.email}
                  className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold hover:bg-blue-200 transition-colors"
                >
                  {(user.name || user.email)[0].toUpperCase()}
                </Link>
              )}
              <button
                onClick={handleLogout}
                className={`text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors ${
                  collapsed ? "w-8 h-7 flex items-center justify-center" : "w-full text-left px-2 py-1.5"
                }`}
                title={collapsed ? "로그아웃" : undefined}
              >
                {collapsed ? "↩" : "로그아웃"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
