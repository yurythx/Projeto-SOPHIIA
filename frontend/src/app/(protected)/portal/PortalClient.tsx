"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Award, Download, Search, ShieldCheck } from "lucide-react";

import { CourseCard } from "@/components/sophiia/CourseCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { sophiiaApi } from "@/lib/api/sophiia";

type StatusFilter = "all" | "in_progress" | "completed";
type SortKey = "recent" | "progress" | "title";

export function PortalClient() {
  const [tab, setTab] = useState<"catalog" | "certificates">("catalog");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const { data: courses } = useSWR("sophiia/my-courses", () => sophiiaApi.listMyCourses());
  const { data: certs } = useSWR(tab === "certificates" ? "sophiia/certs" : null, () =>
    sophiiaApi.listCertificates(),
  );

  const systemsWithCourses = useMemo(
    () => Array.from(new Set((courses ?? []).map((c) => c.system_name))).sort(),
    [courses],
  );
  const [systemFilter, setSystemFilter] = useState<string | null>(null);

  const visible = useMemo(() => {
    let list = courses ?? [];
    if (systemFilter) list = list.filter((c) => c.system_name === systemFilter);
    if (status === "in_progress")
      list = list.filter((c) => !c.is_completed && c.progress_percentage > 0);
    if (status === "completed") list = list.filter((c) => c.is_completed);
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.system_name.toLowerCase().includes(q),
      );
    const sorted = [...list];
    if (sort === "progress") sorted.sort((a, b) => b.progress_percentage - a.progress_percentage);
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    return sorted;
  }, [courses, systemFilter, status, query, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus Cursos"
        subtitle="Capacitação contínua dos sistemas municipais — assista às videoaulas e emita seus certificados."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-surface-border/30 p-1">
            {(["catalog", "certificates"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t === "catalog" ? "Catálogo" : "Certificados"}
              </button>
            ))}
          </div>
        }
      />

      {tab === "catalog" && (
        <>
          {/* Filtros superiores */}
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
                  ["in_progress", "Em andamento"],
                  ["completed", "Concluídos"],
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
                <option value="progress">Progresso</option>
                <option value="title">A–Z</option>
              </select>
            </div>
          </div>

          {systemsWithCourses.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Chip active={systemFilter === null} onClick={() => setSystemFilter(null)}>
                Todos os sistemas
              </Chip>
              {systemsWithCourses.map((s) => (
                <Chip key={s} active={systemFilter === s} onClick={() => setSystemFilter(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}

          {/* Grid */}
          {!courses ? (
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
              {courses.length === 0
                ? "Nenhum curso publicado ainda."
                : "Nenhum curso encontrado com esses filtros."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((c) => (
                <CourseCard key={c.course_id} course={c} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "certificates" && (
        <div className="space-y-3">
          {(certs ?? []).length === 0 && (
            <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-muted">
              <Award className="mx-auto mb-2 h-10 w-10 text-warning" />
              <p className="text-sm font-medium text-foreground">Nenhum certificado emitido.</p>
              <p className="mt-1 text-xs text-muted">
                Conclua 90% ou mais das aulas obrigatórias de um treinamento para gerar seu
                certificado oficial.
              </p>
            </div>
          )}
          {(certs ?? []).map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-surface-border bg-surface p-4"
            >
              <div>
                <p className="text-sm font-bold text-foreground">
                  {c.course_title_snapshot}{" "}
                  <span className="text-xs font-normal text-muted">v{c.version_tag_snapshot}</span>
                </p>
                <p className="text-xs text-muted">
                  {c.workload_hours_snapshot}h · emitido em{" "}
                  {new Date(c.issued_at).toLocaleDateString("pt-BR")} ·{" "}
                  {c.status === "VALID" ? "Válido" : "Revogado"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/validar-certificado/${c.validation_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Validar
                </a>
                <a
                  href={sophiiaApi.certificateDownloadHref(c.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-surface-border text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
