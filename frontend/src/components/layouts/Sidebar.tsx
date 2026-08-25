"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/components/providers/AuthProvider";
import { useUi } from "@/components/providers/UiProvider";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isStaff } from "@/lib/types";

const navItems = [
  { href: "/carpetas", icon: "inventory_2", label: "Carpetas" },
  { href: "/documentos", icon: "description", label: "Documentos" },
  { href: "/busqueda", icon: "search", label: "Búsqueda" },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { sidebarCollapsed } = useUi();
  const { user } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const pathname = usePathname();
  const collapsed = isDesktop && sidebarCollapsed;
  const showLabels = !collapsed;
  const items = [
    ...navItems,
    ...(user && isStaff(user.role)
      ? [{ href: "/usuarios", icon: "admin_panel_settings", label: "Administración" }]
      : []),
  ];

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={onClose} />}

      <nav
        className={`
          fixed left-0 top-0 h-full border-r border-outline-variant bg-white z-40
          flex flex-col py-6 transition-all duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
        style={{ width: isDesktop ? (collapsed ? 72 : 260) : 260 }}
      >
        <div
          className={`mb-6 bg-primary border-b-4 border-secondary ${
            collapsed
              ? "mx-2 rounded-2xl px-1 py-3 flex justify-center"
              : "mx-3 rounded-2xl px-3 py-5 flex flex-col items-center"
          }`}
        >
          <img
            src="/logo-utepsa.png?v=3"
            alt="UTEPSA"
            className={collapsed ? "h-8 w-auto max-w-full object-contain" : "h-12 w-auto max-w-full object-contain"}
          />
        </div>

        <div className={`mb-6 ${collapsed ? "px-3" : "px-4"}`}>
          <Link
            href="/documentos?upload=1"
            onClick={onClose}
            title="Subir Documento"
            className="w-full bg-primary text-white text-sm font-medium py-2.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-light transition-colors"
          >
            <Icon name="upload" className="text-lg shrink-0" />
            {showLabels && <span>Subir Documento</span>}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          <ul className="space-y-1">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    title={item.label}
                    className={`flex items-center gap-3 py-2.5 text-sm rounded-2xl transition-all duration-150 ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      isActive
                        ? "bg-primary/5 text-primary font-medium"
                        : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      className={`text-xl shrink-0 ${isActive ? "text-primary" : ""}`}
                    />
                    {showLabels && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {showLabels && isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-auto border-t border-outline-variant pt-3 px-3 pb-1">
          {showLabels ? (
            <div className="px-1 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">UTEPSA</p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">
                Archivo central · {new Date().getFullYear()}
              </p>
            </div>
          ) : (
            <div className="flex justify-center py-2" title={`UTEPSA ${new Date().getFullYear()}`}>
              <span className="w-2 h-2 rounded-full bg-secondary" />
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
