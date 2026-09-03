"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Clock, FolderPlus, Search, Video } from "lucide-react";

import { CatalogWizard } from "@/components/sophiia/CatalogWizard";
import { CourseCover } from "@/components/sophiia/CourseCover";
import { PageHeader } from "@/components/ui/PageHeader";
import { sophiiaApi, type AdminCourseItem } from "@/lib/api/sophiia";

type StatusFilter = "all" | "published" | "draft";
type SortKey = "recent" | "title" | "videos";

// Studio do Instrutor — grid de cursos no mesmo padrão do Portal. Cada
// card mostra o preparo do curso (vídeos prontos / total de lições) e
// abre a própria página (/studio/curso/[id]) para upload e edição.
export function StudioClient() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const {
    data: courses,
    isLoading,
    mutate,
  } = useSWR("sophiia/admin/courses", () => sophiiaApi.listAdminCourses());

  const visible = useMemo(() => {
    let list = courses ?? [];
    if (status === "published") list = list.filter((c) => c.is_published);
    if (status === "draft") list = list.filter((c) => !c.is_published);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.system_name.toLowerCase().includes(q),
      );
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    else if (sort === "videos") sorted.sort((a, b) => ready(b) - ready(a));
    else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [courses, status, query, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Studio do Instrutor"
        subtitle="Seus cursos de capacitação. Abra um curso para enviar as videoaulas e acompanhar a transcodificação."
        actions={
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FolderPlus className="h-4 w-4" />
            {creating ? "Fechar" : "Novo curso"}
          </button>
        }
      />

      {creating && (
        <CatalogWizard
          onCreated={({ courseId }) => {
            setCreating(false);
            void mutate();
            router.push(`/studio/curso/${courseId}`);
          }}
        />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar curso ou sistema…"
            className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "Todos"],
              ["published", "Publicados"],
              ["draft", "Rascunhos"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-surface-border text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar"
            className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="recent">Mais recentes</option>
            <option value="title">A–Z</option>
            <option value="videos">Vídeos prontos</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] animate-pulse rounded-xl border border-surface-border bg-surface"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface p-10 text-center text-sm text-muted">
          {(courses?.length ?? 0) === 0 ? (
            <>
              Nenhum curso ainda. Use <strong>Novo curso</strong> para criar o primeiro.
            </>
          ) : (
            "Nenhum curso com esses filtros."
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <StudioCourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ready(c: AdminCourseItem): number {
  return c.lessons_count ? c.videos_ready_count / c.lessons_count : 0;
}

function StudioCourseCard({ course }: { course: AdminCourseItem }) {
  const pct = Math.round(ready(course) * 100);
  return (
    <Link
      href={`/studio/curso/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-surface-border bg-surface transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <CourseCover
        id={course.id}
        systemName={course.system_name}
        className="aspect-video w-full"
      >
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            course.is_published
              ? "bg-white/95 text-success-strong"
              : "bg-warning/90 text-black"
          }`}
        >
          {course.is_published ? course.version_tag || "publicado" : "rascunho"}
        </span>
      </CourseCover>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
          {course.title}
        </h3>
        <p className="truncate text-xs text-muted">{course.system_name}</p>

        <div className="mt-auto space-y-1.5 pt-2">
          <div
            role="progressbar"
            aria-label={`${pct}% dos vídeos prontos`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border/60"
          >
            <div
              className={`h-full rounded-full transition-all ${
                pct === 100 ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Video className="h-3 w-3" /> {course.videos_ready_count}/{course.lessons_count} vídeos
              prontos
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
