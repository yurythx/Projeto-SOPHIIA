"use client";

import { PackageX } from "lucide-react";
import type { ReactNode } from "react";

import { useFeatureFlag } from "@/lib/featureFlags";

// ModuleGate esconde o conteúdo de um módulo quando sua feature flag está
// explicitamente desligada, exibindo um aviso amigável. Enquanto o estado
// é "unknown" (carregando, ou usuário sem permissão de ler flags) o
// conteúdo é renderizado normalmente — fail-open, igual ao Sidebar; o
// backend ainda responde 503 nas chamadas de API do módulo desativado.
export function ModuleGate({
  flag,
  moduleName,
  children,
}: {
  flag: string;
  moduleName: string;
  children: ReactNode;
}) {
  const state = useFeatureFlag(flag);

  if (state === "off") {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-surface-border bg-surface p-8 text-center">
        <PackageX className="mx-auto mb-3 h-10 w-10 text-muted" />
        <h2 className="text-base font-bold text-foreground">Módulo desativado</h2>
        <p className="mt-1 text-sm text-muted">
          O módulo <strong>{moduleName}</strong> foi desativado pela administração da plataforma. Um
          administrador pode reativá-lo em Configurações → Feature Flags.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
