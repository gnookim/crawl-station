"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getCurrentUser, type SSOUser } from "@/lib/sso";

interface AuthContextType {
  user: SSOUser | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SSOUser | null>(null);
  const [checking, setChecking] = useState(true);

  async function refreshUser() {
    const u = await getCurrentUser();
    setUser(u);
    if (!u && pathname !== "/login") {
      router.replace("/login");
    }
  }

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
      }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        인증 확인 중...
      </div>
    );
  }
  if (!user) return null;

  return (
    <AuthContext value={{ user, refreshUser }}>
      {children}
    </AuthContext>
  );
}
