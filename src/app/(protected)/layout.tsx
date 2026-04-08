"use client";

import AuthGuard from "@/components/AuthGuard";
import { Sidebar } from "@/components/layout/sidebar";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0">
          {/* 모바일 햄버거 버튼 공간 */}
          <div className="h-12 lg:hidden" />
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
