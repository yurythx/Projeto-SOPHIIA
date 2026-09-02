"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronRight, FolderPlus, Loader2, Video } from "lucide-react";

import { CatalogWizard } from "@/components/sophiia/CatalogWizard";
import { sophiiaApi } from "@/lib/api/sophiia";

// Studio do Instrutor — LISTAGEM de cursos. Cada curso abre a própria
// página (/studio/curso/[id]) onde se faz o upload e a transcodificação
// dos vídeos, lição por lição. "Novo curso" abre o assistente e, ao
// terminar, já navega para a página do curso criado.
export function StudioClient() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const { data: courses, isLoading, mutate } = useSWR("sophiia/admin/courses", () =>
    sophiiaApi.listAdminCourses(),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Studio do Instrutor</h1>
          <p className="text-sm text-muted">
            Cursos de capacitação. Abra um curso para enviar as videoaulas e acompanhar a
            transcodificação HLS.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FolderPlus className="h-4 w-4" />
          {creating ? "Fechar" : "Novo curso"}
        </button>
      </header>

      {creating && (
        <CatalogWizard
          onCreated={({ courseId }) => {
            setCreating(false);
            void mutate();
            router.push(`/studio/curso/${courseId}`);
          }}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-surface-border bg-surface-hover/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span>Curso / Sistema</span>
          <span className="text-center">Versão</span>
          <span className="text-center">Lições</span>
          <span className="text-center">Vídeos</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando cursos…
          </div>
        )}

        {!isLoading && (courses?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-sm text-muted">
            Nenhum curso ainda. Use <strong>Novo curso</strong> para criar o primeiro.
          </div>
        )}

        {courses?.map((c) => (
          <Link
            key={c.id}
            href={`/studio/curso/${c.id}`}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-surface-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-surface-hover"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground">{c.title}</span>
              <span className="block truncate text-xs text-muted">{c.system_name}</span>
            </span>
            <span className="text-center text-xs">
              {c.is_published ? (
                <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success-strong">
                  {c.version_tag || "publicado"}
                </span>
              ) : (
                <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning-strong">
                  rascunho
                </span>
              )}
            </span>
            <span className="text-center font-mono text-xs text-muted">{c.lessons_count}</span>
            <span className="flex items-center justify-center gap-1 text-center font-mono text-xs text-muted">
              <Video className="h-3 w-3" />
              {c.videos_ready_count}/{c.lessons_count}
              <ChevronRight className="ml-1 h-4 w-4 text-muted" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
