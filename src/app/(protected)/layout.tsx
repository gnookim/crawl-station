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
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </AuthGuard>
  );
}
