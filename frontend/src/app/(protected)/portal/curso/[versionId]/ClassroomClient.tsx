"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
} from "lucide-react";

import { completeLessonAction, recordHeartbeatAction } from "@/app/actions/sophiia";
import { useToast } from "@/components/notifications/ToastProvider";
import { HlsPlayer } from "@/components/sophiia/HlsPlayer";
import { hlsMasterUrl, sophiiaApi, type OutlineLesson } from "@/lib/api/sophiia";

type Tab = "overview" | "materials" | "questions";

// Altura máxima do palco do vídeo: viewport menos a barra e-MAG
// (--a11y-bar-h), a topbar (--topbar-h) e uma folga pro cabeçalho da sala
// + respiro. Mantém o player inteiro visível sem rolar (padrão Udemy).
const PLAYER_MAX_H = "calc(100dvh - var(--a11y-bar-h) - var(--topbar-h) - 5rem)";

function fmtDur(seconds: number): string {
  if (!seconds || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ClassroomClient({ versionId }: { versionId: string }) {
  const { showToast } = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  const { data: outline, mutate: mutateOutline } = useSWR(["sophiia/outline", versionId], () =>
    sophiiaApi.courseOutline(versionId),
  );
  const { data: myCourses } = useSWR("sophiia/my-courses", () => sophiiaApi.listMyCourses());
  const course = myCourses?.find((c) => c.version_id === versionId) ?? null;

  const modules = useMemo(() => outline?.modules ?? [], [outline]);
  const flatLessons = useMemo(
    () => modules.flatMap((m) => (m.lessons ?? []).map((l) => ({ ...l, moduleTitle: m.title }))),
    [modules],
  );

  // Aula ativa: a escolha do usuário, senão a 1ª não concluída com vídeo
  // pronto, senão a 1ª de todas — derivada no render, sem useEffect.
  const fallbackId =
    flatLessons.find((l) => !l.completed && l.video_status === "READY")?.id ??
    flatLessons[0]?.id ??
    null;
  const activeId = picked ?? fallbackId;

  const active = flatLessons.find((l) => l.id === activeId) ?? null;
  const activeIndex = flatLessons.findIndex((l) => l.id === activeId);
  const next = activeIndex >= 0 ? flatLessons[activeIndex + 1] : undefined;

  const done = flatLessons.filter((l) => l.completed).length;
  const total = flatLessons.length;

  const handleHeartbeat = useCallback(
    (pos: number) => {
      if (activeId) recordHeartbeatAction(versionId, activeId, pos).catch(() => {});
    },
    [versionId, activeId],
  );

  const handleComplete = useCallback(
    async (lessonId: string) => {
      try {
        await completeLessonAction(lessonId);
        await mutateOutline();
        void globalMutate("sophiia/my-courses");
        showToast({ title: "Aula concluída", tone: "success" });
      } catch {
        showToast({ title: "Falha ao salvar o progresso", tone: "danger" });
      }
    },
    [mutateOutline, showToast],
  );

  function toggleModule(id: string) {
    setCollapsedModules((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex flex-col gap-0 rounded-xl border border-surface-border bg-surface">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link
          href="/portal"
          className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Meus cursos</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
          {course?.title ?? "Curso"}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <ProgressRing done={done} total={total} />
          <span className="hidden text-xs text-muted sm:inline">
            {done}/{total} aulas concluídas
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Recolher conteúdo" : "Expandir conteúdo"}
          className="hidden shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground lg:block"
        >
          {sidebarOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Split view — ~70/30 no desktop, empilhado no mobile. items-start
          para a sidebar poder ser mais curta que a coluna do player e
          rolar sozinha (sticky). */}
      <div
        className={`grid grid-cols-1 lg:items-start ${
          sidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]" : ""
        }`}
      >
        {/* ESQUERDA — player + detalhes */}
        <div
          className={`min-w-0 border-b border-surface-border lg:border-b-0 ${
            sidebarOpen ? "lg:border-r" : ""
          }`}
        >
          {/* Palco do vídeo estilo Udemy: a altura nunca passa da viewport
              (menos a barra e-MAG + a topbar + o cabeçalho da sala), então
              o player inteiro — controles incluídos — cabe sem rolar. A
              largura acompanha o 16:9 dessa altura e fica centrada; a
              sobra lateral é preta. */}
          <div className="flex justify-center bg-black">
            <div
              className="relative aspect-video w-full min-h-[180px]"
              style={{
                maxHeight: PLAYER_MAX_H,
                maxWidth: `calc(${PLAYER_MAX_H} * 16 / 9)`,
              }}
            >
              {active?.video_status === "READY" && active.hls_master_key ? (
                <HlsPlayer
                  key={active.id}
                  className="h-full w-full"
                  src={hlsMasterUrl(active.hls_master_key)}
                  resumeKey={`sophiia:resume:${versionId}:${active.id}`}
                  onProgress={handleHeartbeat}
                  onEnded={() => handleComplete(active.id)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-xs text-white/60">
                  {active
                    ? active.has_video
                      ? `Vídeo ${active.video_status ?? ""} — ainda não disponível`
                      : "Esta aula não tem vídeo"
                    : "Carregando…"}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground">{active?.title ?? "—"}</h1>
                <p className="text-xs text-muted">
                  {active?.moduleTitle}
                  {active?.duration_seconds ? ` · ${fmtDur(active.duration_seconds)}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!active || active.completed}
                  onClick={() => active && handleComplete(active.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-hover disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  {active?.completed ? "Concluída" : "Marcar como concluída"}
                </button>
                {next && (
                  <button
                    type="button"
                    onClick={() => setPicked(next.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Próxima aula
                  </button>
                )}
              </div>
            </div>

            {/* Abas */}
            <div className="border-b border-surface-border">
              <nav className="flex gap-4 text-xs font-medium">
                {(
                  [
                    ["overview", "Visão Geral"],
                    ["materials", "Material de apoio"],
                    ["questions", "Dúvidas"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 pb-2 pt-1 transition-colors ${
                      tab === k
                        ? "border-primary text-primary"
                        : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {tab === "overview" &&
              (active?.markdown_content ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {active.markdown_content}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {course?.description || "Sem descrição para esta aula."}
                </p>
              ))}

            {tab === "materials" && (
              <EmptyTab text="Nenhum material de apoio anexado a esta aula." />
            )}
            {tab === "questions" && (
              <EmptyTab text="O canal de dúvidas ainda não está disponível neste portal." />
            )}
          </div>
        </div>

        {/* DIREITA — sidebar de conteúdo. No desktop fica fixa e rola
            sozinha; no mobile (empilhada) a lista tem altura limitada pra
            não gerar uma página infinita num curso com muitas aulas. */}
        {sidebarOpen && (
          <aside className="min-w-0 lg:sticky lg:top-2 lg:self-start">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <span className="text-sm font-bold text-foreground">Conteúdo do curso</span>
              <span className="text-[11px] text-muted">
                {done}/{total}
              </span>
            </div>
            <div className="max-h-[65vh] divide-y divide-surface-border overflow-y-auto overscroll-contain lg:max-h-[calc(100vh-8rem)]">
              {modules.map((m) => {
                const lessons = m.lessons ?? [];
                const modSecs = lessons.reduce((a, l) => a + (l.duration_seconds || 0), 0);
                const open = !collapsedModules.has(m.id);
                return (
                  <div key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggleModule(m.id)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-hover"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-foreground">{m.title}</span>
                        <span className="block text-[11px] text-muted">
                          {lessons.length} {lessons.length === 1 ? "aula" : "aulas"}
                          {modSecs ? ` · ${fmtDur(modSecs)}` : ""}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <ul>
                        {lessons.map((l) => (
                          <SidebarLesson
                            key={l.id}
                            lesson={l}
                            active={l.id === activeId}
                            onClick={() => setPicked(l.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {modules.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted">Este curso ainda não tem aulas.</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function SidebarLesson({
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
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-xs transition-colors ${
          active ? "bg-primary/10" : "hover:bg-surface-hover"
        }`}
      >
        <span className="mt-0.5 shrink-0">
          {lesson.completed ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <PlayCircle className={`h-4 w-4 ${active ? "text-primary" : "text-muted"}`} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${active ? "font-semibold text-primary" : "text-foreground"}`}>
            {lesson.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted">
            <span>{lesson.duration_seconds ? fmtDur(lesson.duration_seconds) : "vídeo"}</span>
            {!lesson.is_mandatory && <span>· opcional</span>}
            {lesson.has_video && lesson.video_status !== "READY" && (
              <span className="uppercase text-warning-strong">{lesson.video_status}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 9;
  const circ = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center" title={`${pct}%`}>
      <svg viewBox="0 0 24 24" className="h-7 w-7 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--surface-border)" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute text-[8px] font-bold text-foreground">{pct}</span>
    </span>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-surface-border p-8 text-center text-xs text-muted">
      <FileText className="h-6 w-6 text-muted/60" />
      {text}
    </div>
  );
}
