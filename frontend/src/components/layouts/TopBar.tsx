"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUi } from "@/components/providers/UiProvider";
import { initials, ROLE_LABEL } from "@/lib/types";

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
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
    <header className="flex justify-between items-center w-full px-4 md:px-8 h-14 sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="md:hidden text-on-surface-variant p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={onMenuToggle}
        >
          <Icon name="menu" className="text-xl" />
        </button>
        <button
          type="button"
          className="hidden md:flex items-center justify-center p-1.5 rounded-lg text-on-surface-variant hover:bg-gray-100 hover:text-on-surface transition-colors"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          <Icon name={sidebarCollapsed ? "menu" : "menu_open"} className="text-xl" />
        </button>
        <span className="hidden lg:block text-xs font-medium text-on-surface-variant ml-1">UTEPSA</span>
      </div>

      <form className="flex-1 max-w-lg mx-3 md:mx-6 relative" onSubmit={onSearch}>
        <div className="relative flex items-center w-full h-9 rounded-lg bg-gray-50 border border-transparent hover:bg-gray-100 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary focus-within:bg-white transition-all">
          <div className="grid place-items-center h-full w-10 text-on-surface-variant">
            <Icon name="search" className="text-lg" />
          </div>
          <input
            className="peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-3 border-none focus:ring-0 placeholder:text-gray-400"
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
            className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 transition-colors p-1 pr-2 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
              {user ? initials(user.full_name) : "—"}
            </div>
            <div className="hidden sm:block text-left max-w-[180px]">
              <p className="text-sm font-medium text-on-surface leading-tight truncate">
                {user?.full_name ?? "Cargando..."}
              </p>
              <p className="text-xs text-on-surface-variant truncate">
                {user ? ROLE_LABEL[user.role] : "Sesión"}
              </p>
            </div>
            <Icon name="expand_more" className="text-base text-on-surface-variant hidden sm:block" />
          </button>
          {showUserMenu && user && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-on-surface">{user.full_name}</p>
                <p className="text-xs text-primary font-medium mt-0.5">{ROLE_LABEL[user.role]}</p>
                <p className="text-xs text-on-surface-variant mt-1">{user.email}</p>
              </div>
              <div className="border-t border-gray-100 py-1">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Icon name="logout" className="text-lg" />
                  Cerrar Sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
