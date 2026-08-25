"use client";

import { useState } from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { UiProvider, useUi } from "@/components/providers/UiProvider";
import { Sidebar } from "@/components/layouts/Sidebar";
import { TopBar } from "@/components/layouts/TopBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { sidebarCollapsed } = useUi();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const marginLeft = isDesktop ? (sidebarCollapsed ? 72 : 260) : 0;

  return (
    <div className="flex min-h-screen bg-white text-on-surface font-sans antialiased">
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div
        className="flex-1 flex flex-col min-h-screen transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft }}
      >
        <TopBar onMenuToggle={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 md:px-10 md:py-8 overflow-y-auto bg-surface-container">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <AuthProvider>
        <DashboardShell>{children}</DashboardShell>
      </AuthProvider>
    </UiProvider>
  );
}
