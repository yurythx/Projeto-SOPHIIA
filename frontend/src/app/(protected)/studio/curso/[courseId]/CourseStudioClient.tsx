"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Loader2, Rocket, Video } from "lucide-react";

import { useToast } from "@/components/notifications/ToastProvider";
import { CourseCover } from "@/components/sophiia/CourseCover";
import { InlineAdd } from "@/components/sophiia/InlineAdd";
import { LessonUploader } from "@/components/sophiia/LessonUploader";
import { sophiiaApi } from "@/lib/api/sophiia";

// Página de UM curso no Studio: cabeçalho, árvore módulos → lições e, por
// lição, o widget de upload + transcodificação (LessonUploader). Também
// permite adicionar módulo/lição e publicar a versão em rascunho.
export function CourseStudioClient({ courseId }: { courseId: string }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const {
    data: courses,
    mutate: mutateCourses,
    isLoading: loadingCourse,
  } = useSWR("sophiia/admin/courses", () => sophiiaApi.listAdminCourses());
  const course = courses?.find((c) => c.id === courseId) ?? null;
  const versionId = course?.current_version_id ?? null;

  const {
    data: outline,
    mutate: mutateOutline,
    isLoading: loadingOutline,
  } = useSWR(versionId ? ["sophiia/outline", versionId] : null, () =>
    sophiiaApi.courseOutline(versionId as string),
  );

  const modules = useMemo(() => outline?.modules ?? [], [outline]);
  const lessonStats = useMemo(() => {
    const all = modules.flatMap((m) => m.lessons ?? []);
    return {
      total: all.length,
      ready: all.filter((l) => l.video_status === "READY").length,
      processing: all.filter((l) => l.video_status === "PROCESSING").length,
    };
  }, [modules]);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      showToast({
        title: "Falha",
        description: e instanceof Error ? e.message : undefined,
        tone: "danger",
      });
    } finally {
      setBusy(null);
    }
  }

  async function addModule(title: string) {
    if (!versionId) throw new Error("Curso sem versão.");
    await sophiiaApi.createModule(versionId, { title, order_index: modules.length });
    await mutateOutline();
    await mutateCourses();
  }

  async function addLesson(moduleId: string, count: number, title: string) {
    await sophiiaApi.createLesson(moduleId, { title, is_mandatory: true, order_index: count });
    await mutateOutline();
    await mutateCourses();
  }

  function publish() {
    if (!versionId) return;
    void guard("publish", async () => {
      await sophiiaApi.publishVersion(versionId);
      await mutateCourses();
      showToast({ title: "Versão publicada", tone: "success" });
    });
  }

  return (
    <div className="space-y-6">
      <Link
        href="/studio"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todos os cursos
      </Link>

      {loadingCourse && !course ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !course ? (
        <p className="text-sm text-danger-strong">Curso não encontrado.</p>
      ) : (
        <>
          <header className="flex flex-col gap-4 border-b border-surface-border pb-5 sm:flex-row sm:items-center">
            <CourseCover
              id={course.id}
              systemName={course.system_name}
              className="h-24 w-40 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold text-foreground">{course.title}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {course.system_name}
                {course.version_tag ? ` · versão ${course.version_tag}` : ""} ·{" "}
                {course.is_published ? (
                  <span className="text-success-strong">publicada</span>
                ) : (
                  <span className="text-warning-strong">rascunho</span>
                )}
              </p>
              {lessonStats.total > 0 && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                  <Video className="h-3.5 w-3.5" />
                  {lessonStats.ready}/{lessonStats.total} aulas com vídeo pronto
                  {lessonStats.processing > 0 && ` · ${lessonStats.processing} transcodificando`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {!course.is_published && versionId && (
                <button
                  type="button"
                  onClick={publish}
                  disabled={busy === "publish"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === "publish" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Rocket className="h-3.5 w-3.5" />
                  )}
                  Publicar versão
                </button>
              )}
              {versionId && (
                <span className="rounded-lg border border-surface-border px-2 py-1">
                  <InlineAdd
                    label="Módulo"
                    placeholder="Título do módulo"
                    size="md"
                    onAdd={addModule}
                  />
                </span>
              )}
            </div>
          </header>

          {!versionId && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-strong">
              Este curso ainda não tem versão. Crie o curso pelo assistente do Studio (que já cria e
              publica uma versão) para poder adicionar lições.
            </p>
          )}

          {loadingOutline && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando estrutura…
            </div>
          )}

          {versionId && !loadingOutline && modules.length === 0 && (
            <p className="text-sm text-muted">
              Nenhum módulo. Use <strong>+ Módulo</strong> para começar.
            </p>
          )}

          <div className="space-y-4">
            {modules.map((m) => {
              const lessons = m.lessons ?? [];
              return (
                <section key={m.id} className="rounded-xl border border-surface-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="min-w-0 truncate text-sm font-bold text-foreground">
                      {m.title}
                      <span className="ml-2 font-normal text-muted">
                        {lessons.length} {lessons.length === 1 ? "lição" : "lições"}
                      </span>
                    </h2>
                    <InlineAdd
                      label="Lição"
                      placeholder="Título da lição"
                      onAdd={(title) => addLesson(m.id, lessons.length, title)}
                    />
                  </div>

                  {lessons.length === 0 ? (
                    <p className="text-xs text-muted">Sem lições neste módulo.</p>
                  ) : (
                    <ul className="space-y-3">
                      {lessons.map((l) => (
                        <li key={l.id} className="space-y-2 border-t border-surface-border pt-3 first:border-0 first:pt-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-foreground">{l.title}</span>
                            {l.is_mandatory && (
                              <span className="rounded bg-surface-border/50 px-1.5 py-0.5 text-[10px] text-muted">
                                obrigatória
                              </span>
                            )}
                          </div>
                          <LessonUploader
                            lessonId={l.id}
                            onChanged={() => {
                              void mutateOutline();
                              void mutateCourses();
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
