"use client";

import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { useBranding } from "@/components/branding/BrandingContext";
import type { ConnectionState } from "@/lib/websocket/client";

const connectionCopy: Record<ConnectionState, { label: string; dotClass: string }> = {
  idle: { label: "Conectando…", dotClass: "bg-status-unknown" },
  connecting: { label: "Conectando…", dotClass: "bg-status-unknown" },
  open: { label: "Ao vivo", dotClass: "bg-status-online" },
  closed: { label: "Reconectando…", dotClass: "bg-status-degraded" },
  unauthorized: { label: "Sessão expirada", dotClass: "bg-status-offline" },
};

// Barra principal de navegação do dashboard. A faixa e-MAG (contraste,
// fonte, atalhos, VLibras) virou a AccessibilityBar global
// (src/components/a11y/AccessibilityBar.tsx), fixa acima desta — por isso
// esta Topbar começa em top = --a11y-bar-h.
export function Topbar({
  userLabel,
  connectionState,
  onToggleSidebar,
  initialTheme,
}: {
  userLabel: string;
  connectionState: ConnectionState;
  onToggleSidebar: () => void;
  initialTheme?: "light" | "dark";
}) {
  const status = connectionCopy[connectionState];
  const { branding } = useBranding();
  const [logoError, setLogoError] = useState(false);

  return (
    <header
      id="menu"
      tabIndex={-1}
      className="fixed inset-x-0 top-[var(--a11y-bar-h)] z-40 flex h-[var(--topbar-h)] items-center justify-between border-b border-surface-border bg-surface px-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Alternar menu lateral"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        {/* Logomarca dinâmica com fallback vetorial seguro */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md p-1"
        >
          {branding.logoUrl && !logoError ? (
            <Image
              src={branding.logoUrl}
              alt={`Logomarca de ${branding.appName}`}
              onError={() => setLogoError(true)}
              width={120}
              height={32}
              className="h-8 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm group-hover:bg-primary-hover transition-colors">
              <ShieldCheck size={20} />
            </div>
          )}

          <span className="flex flex-col">
            <span className="text-sm font-bold text-foreground leading-tight tracking-tight group-hover:text-primary transition-colors">
              {branding.appName}
            </span>
            <span className="text-[10px] text-muted font-mono uppercase tracking-[0.12em] leading-none">
              Capacitação & Certificação
            </span>
          </span>
        </Link>

        <div
          className="hidden items-center gap-2 text-xs text-muted md:flex ml-4 pl-4 border-l border-surface-border"
          title="Status da conexão de notificações em tempo real"
        >
          <span
            className={`h-2 w-2 rounded-full transition-colors ${status.dotClass}`}
            aria-hidden="true"
          />
          <span>{status.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle initialTheme={initialTheme} />
        <NotificationBell />
        <div className="ml-1">
          <UserMenu userLabel={userLabel} />
        </div>
      </div>
    </header>
  );
}
