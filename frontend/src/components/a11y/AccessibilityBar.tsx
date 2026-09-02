"use client";

import { Accessibility, Eye } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  getBrandingSnapshot,
  subscribeBranding,
  updateBrandingStore,
} from "@/components/branding/brandingStore";
import {
  DEFAULT_SCALE,
  decreaseFontScale,
  getFontScaleSnapshot,
  increaseFontScale,
  resetFontScale,
  subscribeFontScale,
} from "@/lib/a11y/fontScaleStore";

// Barra de acessibilidade e-MAG, fixa no topo de TODAS as páginas
// (montada em src/app/layout.tsx): atalhos de teclado, alto contraste,
// redimensionamento de fonte (A+ / A- / A) e link para a página de
// acessibilidade. O VLibras NÃO fica aqui — aparece no formato oficial do
// Governo Federal (botão flutuante injetado por components/a11y/VLibras.tsx).

// Atalhos de salto (e-MAG 1.5). Cada um só é renderizado quando o alvo
// existe na página atual — um link de salto que aponta pra uma âncora
// inexistente é uma falha de conformidade pior que a ausência do atalho.
// A numeração segue a convenção nacional (1 conteúdo, 2 menu, 3 busca,
// 4 rodapé); o 3 fica vago de propósito — a plataforma não tem busca
// global, então nunca houve âncora #busca pra saltar.
const SKIP_LINKS = [
  { href: "#conteudo", accessKey: "1", label: "[Alt+1] Ir para o conteúdo" },
  { href: "#menu", accessKey: "2", label: "[Alt+2] Ir para o menu" },
  { href: "#rodape", accessKey: "4", label: "[Alt+4] Ir para o rodapé" },
] as const;

const ALL_SKIP_HREFS = SKIP_LINKS.map((l) => l.href);
export function AccessibilityBar({
  initialHighContrast = false,
  initialFontScale = DEFAULT_SCALE,
  initialOrgName = "Governo Municipal",
}: {
  initialHighContrast?: boolean;
  initialFontScale?: number;
  initialOrgName?: string;
}) {
  const branding = useSyncExternalStore(
    subscribeBranding,
    getBrandingSnapshot,
    () => ({ ...getBrandingSnapshot(), highContrast: initialHighContrast, orgName: initialOrgName })
  );

  const highContrast = branding.highContrast;

  // Assina a escala só para re-render em mudança externa; o valor em si é
  // aplicado no <html> pelo store (não é lido aqui).
  useSyncExternalStore(subscribeFontScale, getFontScaleSnapshot, () => initialFontScale);

  // Quais âncoras de salto existem na rota atual. SSR/1º render mostra
  // todas (= comportamento anterior, sem mismatch de hidratação); depois
  // que a página monta, um requestAnimationFrame checa o DOM e remove as
  // que não têm alvo. Re-checa a cada troca de rota (App Router mantém
  // esta barra montada entre navegações).
  const pathname = usePathname();
  const [presentHrefs, setPresentHrefs] = useState<readonly string[]>(ALL_SKIP_HREFS);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setPresentHrefs(ALL_SKIP_HREFS.filter((href) => document.querySelector(href) !== null));
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
  const skipLinks = SKIP_LINKS.filter((l) => presentHrefs.includes(l.href));

  return (
    <div
      id="acessibilidade"
      className="fixed inset-x-0 top-0 z-[80] flex h-[var(--a11y-bar-h)] items-center justify-between gap-2 bg-header-topbar px-3 text-[11px] font-medium text-white/90 sm:px-4"
    >
      {/* Atalhos de teclado — visíveis só ao receber foco (Tab). */}
      {skipLinks.length > 0 && (
        <div className="sr-only flex gap-2 focus-within:not-sr-only focus-within:absolute focus-within:left-2 focus-within:top-full focus-within:z-[81] focus-within:mt-1 focus-within:rounded focus-within:bg-header-topbar focus-within:p-2 focus-within:shadow-lg">
          {skipLinks.map((l) => (
            <SkipLink key={l.href} href={l.href} accessKey={l.accessKey} label={l.label} />
          ))}
        </div>
      )}

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span className="hidden truncate font-semibold uppercase tracking-wider text-white/80 sm:inline">
          {branding.orgName}
        </span>
        <span className="hidden text-white/30 md:inline">•</span>
        <span className="hidden truncate font-normal text-white/70 md:inline">
          {branding.appName} — Capacitação e Certificação
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Link
          href="/acessibilidade"
          title="Página de Acessibilidade — Instruções e Atalhos"
          aria-label="Página de Acessibilidade Oficial"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-white"
        >
          <Accessibility size={15} className="text-white" aria-hidden="true" />
          <span className="hidden sm:inline">Acessibilidade</span>
        </Link>

        <span className="hidden text-white/30 sm:inline">•</span>

        <button
          type="button"
          onClick={() => updateBrandingStore({ highContrast: !highContrast })}
          aria-pressed={highContrast}
          title="Alto Contraste"
          aria-label="Alternar Modo Alto Contraste (Acessibilidade e-MAG)"
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-white ${
            highContrast ? "bg-white/20" : ""
          }`}
        >
          <Eye size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Alto Contraste</span>
        </button>

        <span className="text-white/30">•</span>

        {/* Redimensionamento de fonte — mesmo formato do portal oficial: A+ / A- / A */}
        <div className="flex items-center gap-0.5 rounded-md border border-white/20 bg-white/15 p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={increaseFontScale}
            aria-label="Aumentar Fonte (A+)"
            title="Aumentar Fonte (A+)"
            className="rounded px-2 py-0.5 text-white transition-colors hover:bg-white/25 focus:outline-none"
          >
            A+
          </button>
          <button
            type="button"
            onClick={decreaseFontScale}
            aria-label="Diminuir Fonte (A-)"
            title="Diminuir Fonte (A-)"
            className="rounded px-2 py-0.5 text-white transition-colors hover:bg-white/25 focus:outline-none"
          >
            A-
          </button>
          <button
            type="button"
            onClick={resetFontScale}
            aria-label="Tamanho de Fonte Normal (A)"
            title="Restaurar Tamanho Normal de Fonte (A)"
            className="rounded px-2 py-0.5 text-white transition-colors hover:bg-white/25 focus:outline-none"
          >
            A
          </button>
        </div>
      </div>
    </div>
  );
}

function SkipLink({ href, accessKey, label }: { href: string; accessKey: string; label: string }) {
  return (
    <a
      href={href}
      accessKey={accessKey}
      className="whitespace-nowrap rounded bg-white px-2 py-1 font-bold text-header-topbar hover:bg-primary hover:text-primary-foreground focus:outline-none"
    >
      {label}
    </a>
  );
}
