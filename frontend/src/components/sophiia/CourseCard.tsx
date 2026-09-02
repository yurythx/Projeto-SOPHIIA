"use client";

import Link from "next/link";
import { CheckCircle2, Clock, GraduationCap } from "lucide-react";

import type { MyCourseItem } from "@/lib/api/sophiia";

// Capas geradas: a plataforma não tem upload de imagem de curso, então
// cada curso ganha um gradiente estável derivado do id. EXCEÇÃO
// deliberada à disciplina de tokens do globals.css — isto é arte
// decorativa de placeholder (equivalente a uma foto de capa), não cor de
// UI/tema; fica auto-contido aqui em vez de poluir os tokens semânticos.
const COVERS: [string, string][] = [
  ["#0ea5e9", "#4f46e5"],
  ["#10b981", "#0d9488"],
  ["#8b5cf6", "#7c3aed"],
  ["#f59e0b", "#ea580c"],
  ["#f43f5e", "#db2777"],
  ["#06b6d4", "#2563eb"],
];

function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourseCard({ course }: { course: MyCourseItem }) {
  const pct = Math.round(course.progress_percentage);
  const [c1, c2] = COVERS[hashIndex(course.course_id, COVERS.length)] ?? ["#0ea5e9", "#4f46e5"];

  return (
    <Link
      href={`/portal/curso/${course.version_id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-surface-border bg-surface transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Capa 16:9 gerada */}
      <div
        className="relative flex aspect-video w-full items-center justify-center"
        style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})` }}
      >
        <GraduationCap className="h-10 w-10 text-white/30" aria-hidden="true" />
        <span className="absolute bottom-2 left-2 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
          {initials(course.system_name)}
        </span>
        {course.is_completed && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-success-strong">
            <CheckCircle2 className="h-3 w-3" /> Concluído
          </span>
        )}
      </div>

      {/* Corpo */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
          {course.title}
        </h3>
        <p className="truncate text-xs text-muted">{course.system_name}</p>

        <div className="mt-auto space-y-1.5 pt-2">
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/60"
          >
            <div
              className={`h-full rounded-full transition-all ${
                course.is_completed ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>
              {pct}% concluído
              {course.total_lessons > 0
                ? ` · ${course.completed_lessons}/${course.total_lessons} aulas`
                : ""}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {course.workload_hours}h
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
