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
  const { user, logout } = useAuth();
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
          fixed left-0 top-0 h-full border-r border-gray-200 bg-white z-40
          flex flex-col py-6 transition-all duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
        style={{ width: isDesktop ? (collapsed ? 72 : 260) : 260 }}
      >
        <div className={`px-4 mb-8 flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white shrink-0">
            <Icon name="school" className="text-lg" />
          </div>
          {showLabels && (
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-on-surface tracking-tight leading-none">DocDigitizer</h1>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Gestión Documental</p>
            </div>
          )}
        </div>

        <div className={`mb-6 ${collapsed ? "px-3" : "px-4"}`}>
          <Link
            href="/documentos?upload=1"
            onClick={onClose}
            title="Subir Documento"
            className="w-full bg-primary text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-primary-light transition-colors"
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
                    className={`flex items-center gap-3 py-2.5 text-sm rounded-lg transition-all duration-150 ${
                      collapsed ? "justify-center px-2" : "px-3"
                    } ${
                      isActive
                        ? "bg-primary/5 text-primary font-medium"
                        : "text-on-surface-variant hover:bg-gray-50 hover:text-on-surface"
                    }`}
                  >
                    <Icon name={item.icon} className="text-xl shrink-0" />
                    {showLabels && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-auto border-t border-gray-200 pt-3 px-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              void logout();
            }}
            title="Cerrar Sesión"
            className={`flex items-center gap-3 py-2.5 text-sm text-on-surface-variant hover:bg-red-50 hover:text-red-600 transition-colors rounded-lg w-full ${
              collapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            <Icon name="logout" className="text-xl shrink-0" />
            {showLabels && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </nav>
    </>
  );
}
