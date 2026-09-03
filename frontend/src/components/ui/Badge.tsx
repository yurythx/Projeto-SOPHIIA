import type { HTMLAttributes } from "react";

// Selo (badge) genérico do kit de UI — sem regra de negócio própria, só
// aplica a cor de acordo com o "tone" recebido. Usado, por exemplo, para
// destacar status curtos em tabelas/cards.
type Tone = "neutral" | "success" | "danger" | "warning" | "info";

// Cada tom = um token semântico de globals.css sobre a sua própria versão
// esmaecida (`/10`). Os tokens já resolvem claro / escuro / alto contraste
// sozinhos, então não há mais par `dark:` aqui.
const toneClasses: Record<Tone, string> = {
  neutral: "bg-foreground/5 text-foreground",
  success: "bg-success/10 text-success-strong",
  danger: "bg-danger/10 text-danger-strong",
  warning: "bg-warning/10 text-warning-strong",
  info: "bg-info/10 text-info-strong",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
      {...rest}
    />
  );
}
