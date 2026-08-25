"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logoutRequest } from "@/lib/api";
import { backend } from "@/lib/backend";
import type { User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function refreshUser() {
    const me = await backend.auth.me();
    setUser(me);
  }

  useEffect(() => {
    refreshUser()
      .catch(async () => {
        await logoutRequest().catch(() => undefined);
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await logoutRequest();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, logout }}>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-surface-container">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-on-surface-variant">Cargando sesión...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
