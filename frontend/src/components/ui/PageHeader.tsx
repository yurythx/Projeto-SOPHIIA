import type { ReactNode } from "react";

// Cabeçalho de página canônico — mesma forma em todas as telas
// autenticadas: eyebrow opcional (a "dateline" serifada), título em
// text-2xl bold, subtítulo em muted, e uma área de ações à direita que
// quebra para baixo no mobile.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-surface-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="dateline">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
