import { GraduationCap } from "lucide-react";

// Capa 16:9 gerada: a plataforma não tem upload de imagem de curso, então
// cada curso ganha um gradiente estável derivado do id + iniciais do
// sistema. EXCEÇÃO deliberada à disciplina de tokens do globals.css —
// arte decorativa de placeholder (equivalente a uma foto de capa), não
// cor de UI/tema.
const COVERS: [string, string][] = [
  ["#0ea5e9", "#4f46e5"],
  ["#10b981", "#0d9488"],
  ["#8b5cf6", "#7c3aed"],
  ["#f59e0b", "#ea580c"],
  ["#f43f5e", "#db2777"],
  ["#06b6d4", "#2563eb"],
];

export function coverIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % COVERS.length;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourseCover({
  id,
  systemName,
  className = "",
  children,
}: {
  id: string;
  systemName: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [c1, c2] = COVERS[coverIndex(id)] ?? ["#0ea5e9", "#4f46e5"];
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      <GraduationCap className="h-10 w-10 text-white/30" aria-hidden="true" />
      <span className="absolute bottom-2 left-2 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
        {initials(systemName)}
      </span>
      {children}
    </div>
  );
}
