"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUi } from "@/components/providers/UiProvider";
import { initials, ROLE_LABEL } from "@/lib/types";

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout, loading } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const [query, setQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/busqueda?q=${encodeURIComponent(value)}`);
  }

  return (
    <header className="flex justify-between items-center w-full px-4 md:px-8 h-14 sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-outline-variant">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="md:hidden text-on-surface-variant p-1.5 rounded-2xl hover:bg-surface-container transition-colors"
          onClick={onMenuToggle}
        >
          <Icon name="menu" className="text-xl" />
        </button>
        <button
          type="button"
          className="hidden md:flex items-center justify-center p-1.5 rounded-2xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          <Icon name={sidebarCollapsed ? "menu" : "menu_open"} className="text-xl" />
        </button>
        <span className="hidden lg:flex items-center gap-2 text-xs font-semibold text-on-surface ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          UTEPSA
        </span>
      </div>

      <form className="flex-1 max-w-lg mx-3 md:mx-6 relative" onSubmit={onSearch}>
        <div className="relative flex items-center w-full h-9 rounded-2xl bg-surface-container border border-transparent hover:bg-surface-container-high focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:bg-white transition-all">
          <div className="grid place-items-center h-full w-10 text-on-surface-variant">
            <Icon name="search" className="text-lg" />
          </div>
          <input
            className="peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-3 border-none focus:ring-0 placeholder:text-on-surface-variant/60"
            placeholder="Buscar documentos..."
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </form>

      <div className="flex items-center gap-1">
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((value) => !value)}
            className="flex items-center gap-2.5 cursor-pointer hover:bg-surface-container transition-colors p-1 pr-2.5 rounded-2xl"
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
          >
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-xs shadow-sm ring-2 ring-secondary/40">
              {user ? initials(user.full_name) : loading ? "…" : "—"}
            </div>
            <div className="hidden sm:block text-left max-w-[180px]">
              <p className="text-sm font-medium text-on-surface leading-tight truncate">
                {user?.full_name ?? (loading ? "Cargando..." : "Sin sesión")}
              </p>
              <p className="text-[11px] text-primary font-medium truncate">
                {user ? ROLE_LABEL[user.role] : "—"}
              </p>
            </div>
            <Icon name="expand_more" className="text-base text-on-surface-variant hidden sm:block" />
          </button>

          {showUserMenu && user && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-64 bg-white border border-outline-variant rounded-2xl shadow-lg overflow-hidden z-50 animate-fade-in"
            >
              <div className="px-4 py-4 bg-primary/5 border-b border-outline-variant">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-sm ring-2 ring-secondary">
                    {initials(user.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{user.full_name}</p>
                    <span className="inline-flex mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-on-secondary">
                      {ROLE_LABEL[user.role]}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant mt-3 truncate">{user.email}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void logout()}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-error hover:bg-error-container transition-colors"
                >
                  <Icon name="logout" className="text-lg" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
