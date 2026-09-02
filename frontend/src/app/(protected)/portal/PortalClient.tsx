"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Award,
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";

import { useToast } from "@/components/notifications/ToastProvider";
import { HlsPlayer } from "@/components/sophiia/HlsPlayer";
import {
  hlsMasterUrl,
  sophiiaApi,
  type OutlineLesson,
  type SophiiaCourse,
  type SophiiaSystem,
} from "@/lib/api/sophiia";
import { completeLessonAction, recordHeartbeatAction } from "@/app/actions/sophiia";

export function PortalClient({ fallbackSystems }: { fallbackSystems: SophiiaSystem[] }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"catalog" | "certificates">("catalog");
  const [systemId, setSystemId] = useState<string | null>(null);
  const [course, setCourse] = useState<SophiiaCourse | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);

  const { data: systems } = useSWR("sophiia/systems", () => sophiiaApi.listSystems(), {
    fallbackData: fallbackSystems,
  });
  const activeSystem = systemId ?? systems?.[0]?.id ?? null;

  const { data: courses } = useSWR(activeSystem ? ["sophiia/courses", activeSystem] : null, () =>
    sophiiaApi.listCourses(activeSystem as string),
  );

  const versionId = course?.current_version_id ?? null;
  const { data: outline, mutate: mutateOutline } = useSWR(
    versionId ? ["sophiia/outline", versionId] : null,
    () => sophiiaApi.courseOutline(versionId as string),
  );

  const { data: certs, mutate: mutateCerts } = useSWR(
    tab === "certificates" ? "sophiia/certs" : null,
    () => sophiiaApi.listCertificates(),
  );

  const lessons = useMemo(
    () => (outline?.modules ?? []).flatMap((m) => m.lessons ?? []),
    [outline],
  );
  const currentLesson = lessons.find((l) => l.id === lessonId) ?? null;

  const handleHeartbeat = useCallback(
    (pos: number) => {
      if (versionId && lessonId) {
        recordHeartbeatAction(versionId, lessonId, pos).catch(() => {});
      }
    },
    [versionId, lessonId],
  );

  const handleComplete = useCallback(
    async (id: string) => {
      try {
        await completeLessonAction(id);
        showToast({
          title: "Progresso salvo",
          description: "Aula marcada como concluída.",
          tone: "success",
        });
        await mutateOutline();
        // Na vida real, a conclusão de curso é calculada assincronamente pelo
        // worker. Aqui o mutateCerts vai buscar a lista de novo pra ver se
        // apareceu um novo.
        setTimeout(() => mutateCerts(), 3000);
      } catch {
        showToast({ title: "Falha ao salvar o progresso", tone: "danger" });
      }
    },
    [showToast, mutateOutline, mutateCerts],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-surface-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portal SOPHIIA</h1>
          <p className="text-sm text-muted">
            Capacitação contínua, videoaulas e emissão de certificados dos sistemas municipais.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-surface-border/30 p-1">
          {(["catalog", "certificates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t === "catalog" ? "Catálogo & Aulas" : "Certificados"}
            </button>
          ))}
        </div>
      </header>

      {tab === "catalog" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {(systems ?? []).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSystemId(s.id);
                  setCourse(null);
                  setLessonId(null);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeSystem === s.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-surface-border text-muted hover:text-foreground"
                }`}
              >
                {s.name}
              </button>
            ))}
            {systems && systems.length === 0 && (
              <p className="text-sm text-muted">Nenhum sistema com trilha de capacitação.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              {(courses ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCourse(c);
                    setLessonId(null);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    course?.id === c.id
                      ? "border-primary bg-primary/5"
                      : "border-surface-border bg-surface hover:border-primary/50"
                  }`}
                >
                  <p className="text-sm font-bold text-foreground">{c.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted">
                    <Clock className="h-3 w-3" /> {c.workload_hours ?? 0}h
                    {!c.current_version_id && " · sem versão publicada"}
                  </span>
                </button>
              ))}
              {courses && courses.length === 0 && (
                <p className="text-sm text-muted">Nenhum curso neste sistema.</p>
              )}
            </div>

            <div className="lg:col-span-2">
              {!course && (
                <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-sm text-muted">
                  <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  Selecione um curso para ver as aulas.
                </div>
              )}

              {course && !versionId && (
                <div className="rounded-xl border border-surface-border bg-surface p-8 text-center text-sm text-muted">
                  Este curso ainda não tem uma versão publicada.
                </div>
              )}

              {course && versionId && (
                <div className="space-y-4">
                  {currentLesson?.has_video &&
                  currentLesson.video_status === "READY" &&
                  currentLesson.hls_master_key ? (
                    <HlsPlayer
                      src={hlsMasterUrl(currentLesson.hls_master_key)}
                      onProgress={handleHeartbeat}
                      onEnded={() => handleComplete(currentLesson.id)}
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-surface-border bg-surface text-xs text-muted">
                      {currentLesson
                        ? currentLesson.has_video
                          ? `Vídeo ${currentLesson.video_status ?? ""} — ainda não disponível`
                          : "Esta aula não tem vídeo"
                        : "Selecione uma aula ao lado"}
                    </div>
                  )}

                  {currentLesson && (
                    <div className="flex items-center justify-between rounded-lg border border-surface-border bg-surface p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{currentLesson.title}</p>
                        <p className="text-xs text-muted">
                          {currentLesson.is_mandatory ? "Obrigatória" : "Opcional"} ·{" "}
                          {currentLesson.completed ? "Concluída" : "Não concluída"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleComplete(currentLesson.id)}
                        disabled={currentLesson.completed}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                      >
                        {currentLesson.completed ? "Concluída" : "Marcar como concluída"}
                      </button>
                    </div>
                  )}

                  <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface">
                    {(outline?.modules ?? []).map((m) => (
                      <div key={m.id} className="p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                          {m.title}
                        </p>
                        <ul className="space-y-1">
                          {(m.lessons ?? []).map((l) => (
                            <LessonRow
                              key={l.id}
                              lesson={l}
                              active={l.id === lessonId}
                              onClick={() => setLessonId(l.id)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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

function LessonRow({
  lesson,
  active,
  onClick,
}: {
  lesson: OutlineLesson;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
          active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-surface-border/40"
        }`}
      >
        {lesson.completed ? (
          <CheckCircle className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <PlayCircle className="h-4 w-4 shrink-0 text-muted" />
        )}
        <span className="flex-1 truncate">{lesson.title}</span>
        {lesson.has_video && lesson.video_status !== "READY" && (
          <span className="text-[10px] uppercase text-warning">{lesson.video_status}</span>
        )}
        {!lesson.is_mandatory && <span className="text-[10px] text-muted">opcional</span>}
      </button>
    </li>
  );
}
